import { state } from './state.js';
import { loadView } from './ui.js';

export function renderPluginActivityIcons(): void {
  const activityBar = document.getElementById("activity-bar");
  if (!activityBar) return;

  // Remove existing plugin icons to avoid duplicates if re-rendered
  activityBar.querySelectorAll(".ab-btn-plugin").forEach(btn => btn.remove());

  const plugins = Object.values(state.pluginManifests);
  const uiPlugins = plugins.filter(p => p.ui && p.enabled);

  if (uiPlugins.length === 0) return;

  // Add a divider before plugins if not already there
  if (!activityBar.querySelector(".ab-divider-plugins")) {
    const divider = document.createElement("div");
    divider.className = "ab-divider ab-divider-plugins";
    activityBar.appendChild(divider);
  }

  uiPlugins.forEach(plugin => {
    const btn = document.createElement("button");
    btn.className = "ab-btn ab-btn-plugin";
    btn.title = plugin.ui.sidebarLabel || plugin.name;
    btn.dataset.pluginId = plugin.id;
    const iconStr = plugin.ui.sidebarIcon || plugin.icon || "🧩";
    if (iconStr.startsWith("http") || iconStr.match(/\.(png|jpg|jpeg|gif|svg)$/i)) {
      btn.innerHTML = `<img src="${iconStr}" alt="${plugin.name}" style="width: 20px; height: 20px; object-fit: contain; border-radius: 4px;" />`;
    } else {
      btn.innerHTML = iconStr;
    }
    
    btn.onclick = () => {
      // Deactivate other activity bar buttons
      document.querySelectorAll(".ab-btn").forEach(b => b.classList.remove("active"));
      btn.classList.add("active");
      
      // Load and show plugin view
      loadPluginView(plugin.id);
    };

    activityBar.appendChild(btn);
  });
}

export async function loadPluginView(pluginId: string): Promise<void> {
  const plugin = state.pluginManifests[pluginId];
  if (!plugin || !plugin.ui) return;

  const container = document.getElementById("plugin-view-container");
  if (!container) return;

  // 1. Show the plugin tab-pane
  document.querySelectorAll(".tab").forEach((t) => t.classList.remove("active"));
  document.querySelectorAll(".tab-pane").forEach((p) => p.classList.remove("active"));
  document.getElementById("tab-plugin")?.classList.add("active");

  // 1.5 Handle hardware exclusive mode
  const isExclusive = !!plugin.ui?.exclusiveHardware;
  window.arduino.setHardwareExclusive(isExclusive);

  // 2. Fetch HTML content
  container.innerHTML = `<div style="padding: 20px; color: var(--muted);">Cargando ${plugin.name}...</div>`;
  
  try {
    let html = await window.arduino.readPluginAsset({ 
      pluginId, 
      assetPath: plugin.ui.entryPath 
    });

    if (html) {
      // ─── Asset Inlining (CSS & JS) ───
      // Determine base path for relative assets
      const entryPathParts = plugin.ui.entryPath.split(/[\\\/]/);
      entryPathParts.pop(); // Remove index.html
      const basePath = entryPathParts.length > 0 ? entryPathParts.join("/") + "/" : "";

      const parser = new DOMParser();
      const doc = parser.parseFromString(html, "text/html");

      // Inline Stylesheets
      const links = doc.querySelectorAll('link[rel="stylesheet"]');
      for (const link of Array.from(links)) {
        const href = link.getAttribute("href");
        if (href && !href.startsWith("http")) {
           const css = await window.arduino.readPluginAsset({ 
             pluginId, 
             assetPath: basePath + href 
           });
           if (css) {
             const style = doc.createElement("style");
             style.textContent = css;
             link.replaceWith(style);
           }
        }
      }

      // Inline Scripts
      const scripts = doc.querySelectorAll('script[src]');
      for (const script of Array.from(scripts)) {
        const src = script.getAttribute("src");
        if (src && !src.startsWith("http")) {
           const js = await window.arduino.readPluginAsset({ 
             pluginId, 
             assetPath: basePath + src 
           });
           if (js) {
             const inlineScript = doc.createElement("script");
             inlineScript.textContent = js;
             // Preserve attributes like type="module" if needed
             Array.from(script.attributes).forEach(attr => {
               if (attr.name !== "src") inlineScript.setAttribute(attr.name, attr.value);
             });
             script.replaceWith(inlineScript);
           }
        }
      }

      // Re-serialize the fully bundled HTML
      const bundledHtml = doc.documentElement.outerHTML;

      // Clear container and setup iframe
      container.innerHTML = "";
      const iframe = document.createElement("iframe");
      
      iframe.sandbox.add("allow-scripts");
      iframe.sandbox.add("allow-same-origin");
      iframe.sandbox.add("allow-forms");
      iframe.sandbox.add("allow-modals");
      
      iframe.style.width = "100%";
      iframe.style.height = "100%";
      iframe.style.border = "none";
      iframe.style.background = "transparent";
      
      container.appendChild(iframe);

      // Inject the fully bundled content
      iframe.srcdoc = `
        <!DOCTYPE html>
        <html>
          <head>
            <meta charset="UTF-8">
            <script>
              // Inject a helper to easily access the bridge
              window.arduino = window.parent.arduino;
            </script>
          </head>
          <body>
            ${bundledHtml}
          </body>
        </html>
      `;
    } else {
      container.innerHTML = `<div style="padding: 20px; color: var(--red);">Error: No se pudo cargar el archivo ${plugin.ui.entryPath}</div>`;
    }
  } catch (err: any) {
    container.innerHTML = `<div style="padding: 20px; color: var(--red);">Error al cargar la vista del plugin: ${err.message}</div>`;
  }
}
