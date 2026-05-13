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

  // 2. Fetch HTML content
  container.innerHTML = `<div style="padding: 20px; color: var(--muted);">Cargando ${plugin.name}...</div>`;
  
  try {
    const html = await window.arduino.readPluginAsset({ 
      pluginId, 
      assetPath: plugin.ui.entryPath 
    });

    if (html) {
      // Sanitize and inject
      const purify = (window as any).DOMPurify;
      if (purify) {
        container.innerHTML = purify.sanitize(html, {
          ADD_TAGS: ['script', 'link'], // Allow scripts/links if we trust them? 
          // Actually, for security, let's see. Scripts won't run if just injected via innerHTML.
        });
      } else {
        container.innerHTML = html;
      }

      // Re-trigger scripts manually if needed, or use a safer method
      // For now, let's assume we want to support scripts.
      setupPluginScripts(container, pluginId);
    } else {
      container.innerHTML = `<div style="padding: 20px; color: var(--red);">Error: No se pudo cargar el archivo ${plugin.ui.entryPath}</div>`;
    }
  } catch (err: any) {
    container.innerHTML = `<div style="padding: 20px; color: var(--red);">Error al cargar la vista del plugin: ${err.message}</div>`;
  }
}

function setupPluginScripts(container: HTMLElement, pluginId: string): void {
  // Find all <script> tags and re-create them so they execute
  const scripts = container.querySelectorAll("script");
  scripts.forEach(oldScript => {
    const newScript = document.createElement("script");
    Array.from(oldScript.attributes).forEach(attr => {
      newScript.setAttribute(attr.name, attr.value);
    });
    
    if (oldScript.src) {
        // If it's a local path, we might need to fetch it via IPC too
        // For simplicity, we suggest plugins use inline scripts or relative paths that we might need to intercept.
        // THIS IS COMPLEX. A simpler way is to have plugins provide a .js entry too.
    } else {
      newScript.textContent = oldScript.textContent;
    }
    
    oldScript.parentNode?.replaceChild(newScript, oldScript);
  });
}
