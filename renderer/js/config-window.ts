import { loadView, initConfigColorPicker, showToast, saveConfigView, exportConfig, importConfig, applyTheme } from './ui.js';
import { loadConfig, saveConfig, state } from './state.js';

function initSegments() {
    document.querySelectorAll('.cfg-segment').forEach(seg => {
        const segment = seg as HTMLElement;
        const targetId = segment.dataset.target;
        if (!targetId) return;
        const input = document.getElementById(targetId) as HTMLInputElement | null;
        if (!input) return;
        segment.querySelectorAll('.cfg-seg-btn').forEach(btnEl => {
            const btn = btnEl as HTMLElement;
            btn.classList.toggle('active', btn.dataset.value === input.value);
            btn.addEventListener('click', () => {
                segment.querySelectorAll('.cfg-seg-btn').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                if (btn.dataset.value) input.value = btn.dataset.value;
                input.dispatchEvent(new Event("change"));
            });
        });
    });
}

function initSwatches() {
    const accentEl = document.getElementById('cfg-accent') as HTMLInputElement | null;
    const pickerEl = document.getElementById('cfg-accent-picker') as HTMLInputElement | null;
    const previewEl = document.getElementById('cfg-accent-preview') as HTMLElement | null;
    const syncActive = (val: string) => {
        document.querySelectorAll('.cfg-swatch').forEach(s => {
            const swatch = s as HTMLElement;
            if (swatch.dataset.color) {
                swatch.classList.toggle('active', swatch.dataset.color.toLowerCase() === val.toLowerCase());
            }
        });
    };
    syncActive(accentEl?.value || '#f5a623');
    document.querySelectorAll('.cfg-swatch').forEach(swatchEl => {
        const swatch = swatchEl as HTMLElement;
        swatch.addEventListener('click', () => {
            const color = swatch.dataset.color;
            if (!color) return;
            if (accentEl) accentEl.value = color.toUpperCase();
            if (pickerEl) pickerEl.value = color;
            if (previewEl) previewEl.style.background = color;
            syncActive(color);
        });
    });
    accentEl?.addEventListener('input', () => syncActive(accentEl.value));
}

window.addEventListener("DOMContentLoaded", async () => {
    // Cargar la vista de configuración
    await loadView("config-view-container", "views/config.html");

    // Cargar datos (ahora async)
    await loadConfig();

    // Setup inicial de la vista de config
    const themeEl = document.getElementById("cfg-theme") as HTMLSelectElement | null;
    const closeEl = document.getElementById("cfg-close") as HTMLSelectElement | null;
    const initialTabEl = document.getElementById("cfg-initial-tab") as HTMLSelectElement | null;
    const startupModeEl = document.getElementById("cfg-startup-mode") as HTMLSelectElement | null;
    const zoomEnabledEl = document.getElementById("cfg-zoom-enabled") as HTMLInputElement | null;
    const accentEl = document.getElementById("cfg-accent") as HTMLInputElement | null;
    const pickerEl = document.getElementById('cfg-accent-picker') as HTMLInputElement | null;

    const populateThemes = async () => {
        if (!themeEl) return;
        const themes = await window.arduino.getThemes();
        const currentVal = themeEl.value || state.config.theme || "dark-default";
        themeEl.innerHTML = "";
        themes.forEach(t => {
            const opt = document.createElement("option");
            opt.value = t.id;
            opt.textContent = t.name;
            themeEl.appendChild(opt);
        });
        themeEl.value = currentVal;
        // Si el valor actual no está en la lista (se borró), poner el que diga el state (que ya tendrá el fallback)
        if (themeEl.selectedIndex === -1) {
            themeEl.value = state.config.theme || "dark-default";
        }
    };

    // Populate themes initially
    await populateThemes();

    if (closeEl) closeEl.value = state.config.closeBehavior;
    if (initialTabEl) initialTabEl.value = state.config.initialTab || "monitor";
    if (startupModeEl) startupModeEl.value = state.config.startupMode || "none";
    if (zoomEnabledEl) zoomEnabledEl.checked = state.config.enableZoom !== false;
    if (accentEl) { accentEl.value = (state.config.accentColor || "#f5a623").toUpperCase(); }
    if (pickerEl) pickerEl.value = state.config.accentColor || "#f5a623";

    initSegments();
    initConfigColorPicker();
    initSwatches();

    // Event Listeners
    themeEl?.addEventListener("change", async () => {
        state.config.theme = themeEl.value;
        saveConfig(); // Guardar para persistir el cambio
        window.arduino.notifyThemeChanged();
    });

    zoomEnabledEl?.addEventListener("change", () => {
        state.config.enableZoom = zoomEnabledEl.checked;
        saveConfig();
    });

    document.getElementById("btn-open-themes")?.addEventListener("click", () => window.arduino.openThemesFolder());
    document.getElementById("btn-theme-preview")?.addEventListener("click", () => window.arduino.openThemePreview());

    document.getElementById("btn-import-external-theme")?.addEventListener("click", async () => {
      const result = await window.arduino.importExternalTheme();
      if (!result.ok) {
        if (result.error !== "Cancelled") alert("Error al importar tema: " + result.error);
        return;
      }
      // Refresh theme list and select the new theme
      await populateThemes();
      if (themeEl) {
        themeEl.value = result.theme.id;
        state.config.theme = result.theme.id;
        saveConfig();
        window.arduino.notifyThemeChanged();
      }
    });
    document.getElementById("wbtn-close")?.addEventListener("click", () => window.arduino.close());
    
    document.getElementById("btn-save-config")?.addEventListener("click", () => {
        saveConfigView();
    });
    
    document.getElementById("btn-export")?.addEventListener("click", exportConfig);
    document.getElementById("btn-import")?.addEventListener("click", importConfig);

    // Listen for theme changes from other windows (like the preview window or file watcher)
    window.arduino.onApplyTheme(async () => {
        const oldTheme = state.config.theme;
        await loadConfig();
        await populateThemes();
        if (themeEl && state.config.theme !== oldTheme) {
            themeEl.value = state.config.theme;
        }
    });
});
