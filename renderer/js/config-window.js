import { loadView, initConfigColorPicker, showToast, saveConfigView, exportConfig, importConfig } from './ui.js';
import { loadConfig, state } from './state.js';

window.addEventListener("DOMContentLoaded", async () => {
    // Cargar la vista de configuración
    await loadView("config-view-container", "views/config.html");

    // Cargar datos
    loadConfig();

    // Setup inicial de la vista de config
    const themeEl = document.getElementById("cfg-theme");
    const closeEl = document.getElementById("cfg-close");
    const accentEl = document.getElementById("cfg-accent");
    const pickerEl = document.getElementById("cfg-accent-picker");
    
    if (themeEl) themeEl.value = state.config.theme;
    if (closeEl) closeEl.value = state.config.closeBehavior;
    if (accentEl) { accentEl.value = (state.config.accentColor || "#f5a623").toUpperCase(); }
    if (pickerEl) pickerEl.value = state.config.accentColor || "#f5a623";

    initConfigColorPicker();

    // Event Listeners
    document.getElementById("wbtn-close")?.addEventListener("click", () => window.arduino.close());
    document.getElementById("btn-back-config")?.remove(); // No necesitamos botón volver en ventana separada
    
    document.getElementById("btn-save-config")?.addEventListener("click", () => {
        saveConfigView();
    });
    
    document.getElementById("btn-export")?.addEventListener("click", exportConfig);
    document.getElementById("btn-import")?.addEventListener("click", importConfig);
});
