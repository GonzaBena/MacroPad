import { loadView, initConfigColorPicker, showToast, saveConfigView, exportConfig, importConfig, applyTheme } from './ui.js';
import { loadConfig, saveConfig, state } from './state.js';

window.addEventListener("DOMContentLoaded", async () => {
    // Cargar la vista de configuración
    await loadView("config-view-container", "views/config.html");

    // Cargar datos (ahora async)
    await loadConfig();

    // Setup inicial de la vista de config
    const themeEl = document.getElementById("cfg-theme");
    const closeEl = document.getElementById("cfg-close");
    const initialTabEl = document.getElementById("cfg-initial-tab");
    const startupModeEl = document.getElementById("cfg-startup-mode");
    const zoomEnabledEl = document.getElementById("cfg-zoom-enabled");
    const accentEl = document.getElementById("cfg-accent");
    const pickerEl = document.getElementById("cfg-accent-picker");

    // Populate themes
    const themes = await window.arduino.getThemes();
    if (themeEl) {
        themeEl.innerHTML = "";
        themes.forEach(t => {
            const opt = document.createElement("option");
            opt.value = t.id;
            opt.textContent = t.name + (t.isUserTheme ? " (Usuario)" : "");
            themeEl.appendChild(opt);
        });
        // IMPORTANTE: Asignar el valor después de poblar las opciones
        themeEl.value = state.config.theme || "dark-default";
    }

    if (closeEl) closeEl.value = state.config.closeBehavior;
    if (initialTabEl) initialTabEl.value = state.config.initialTab || "monitor";
    if (startupModeEl) startupModeEl.value = state.config.startupMode || "none";
    if (zoomEnabledEl) zoomEnabledEl.checked = state.config.enableZoom !== false;
    if (accentEl) { accentEl.value = (state.config.accentColor || "#f5a623").toUpperCase(); }
    if (pickerEl) pickerEl.value = state.config.accentColor || "#f5a623";

    initConfigColorPicker();

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
      const themes = await window.arduino.getThemes();
      if (themeEl) {
        themeEl.innerHTML = "";
        themes.forEach(t => {
          const opt = document.createElement("option");
          opt.value = t.id;
          opt.textContent = t.name + (t.isUserTheme ? " (Usuario)" : "");
          themeEl.appendChild(opt);
        });
        themeEl.value = result.theme.id;
        state.config.theme = result.theme.id;
        saveConfig();
        window.arduino.notifyThemeChanged();
      }
    });
    document.getElementById("wbtn-close")?.addEventListener("click", () => window.arduino.close());
    document.getElementById("btn-back-config")?.remove(); // No necesitamos botón volver en ventana separada
    
    document.getElementById("btn-save-config")?.addEventListener("click", () => {
        saveConfigView();
    });
    
    document.getElementById("btn-export")?.addEventListener("click", exportConfig);
    document.getElementById("btn-import")?.addEventListener("click", importConfig);

    // Listen for theme changes from other windows (like the preview window)
    window.arduino.onApplyTheme(async () => {
        const oldTheme = state.config.theme;
        await loadConfig();
        if (themeEl && state.config.theme !== oldTheme) {
            themeEl.value = state.config.theme;
        }
    });
});
