let currentThemes = [];
let selectedThemeId = null;

document.addEventListener("DOMContentLoaded", async () => {
    const listEl = document.getElementById("theme-list");
    const nameEl = document.getElementById("preview-theme-name");
    const containerEl = document.getElementById("preview-container");
    const applyBtn = document.getElementById("btn-apply-theme");
    const cancelBtn = document.getElementById("btn-cancel-preview");
    const closeBtn = document.getElementById("btn-close");

    // Load themes
    currentThemes = await window.arduino.getThemes();
    
    // Get current config to highlight active theme
    const data = await window.arduino.loadData();
    selectedThemeId = data.config.theme;

    const renderList = () => {
        listEl.innerHTML = "";
        currentThemes.forEach(t => {
            const div = document.createElement("div");
            div.className = "theme-item" + (t.id === selectedThemeId ? " active" : "");
            div.innerHTML = `
                <div class="theme-item-name">${t.name}</div>
                <div class="theme-item-type">${t.type.toUpperCase()}</div>
            `;
            div.addEventListener("click", () => selectTheme(t.id));
            listEl.appendChild(div);
        });
    };

    const selectTheme = async (id) => {
        selectedThemeId = id;
        renderList();
        
        const themeData = await window.arduino.getThemeData(id);
        if (themeData) {
            nameEl.textContent = themeData.name;
            // Apply colors to the preview container only
            for (const [key, value] of Object.entries(themeData.colors)) {
                containerEl.style.setProperty(key, value);
            }
        }
    };

    applyBtn.addEventListener("click", async () => {
        if (!selectedThemeId) return;
        
        // Save to config
        const data = await window.arduino.loadData();
        data.config.theme = selectedThemeId;
        await window.arduino.saveData(data);
        
        // Notify other windows
        window.arduino.notifyThemeChanged();

        // Close window
        window.arduino.close();
    });

    const close = () => window.arduino.close();
    cancelBtn.addEventListener("click", close);
    closeBtn.addEventListener("click", close);

    renderList();
    if (selectedThemeId) selectTheme(selectedThemeId);

    // Listen for external theme changes (like file deletions)
    window.arduino.onApplyTheme(async () => {
        currentThemes = await window.arduino.getThemes();
        renderList();
        
        // If current selected theme was deleted, fall back in the preview too
        const themeStillExists = currentThemes.some(t => t.id === selectedThemeId);
        if (!themeStillExists) {
            const data = await window.arduino.loadData();
            if (data.config.theme) selectTheme(data.config.theme);
        }
    });
});
