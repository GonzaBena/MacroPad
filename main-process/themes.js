const { app, shell } = require("electron");
const fs = require("fs");
const path = require("path");

const BUILTIN_THEMES_DIR = path.join(__dirname, "..", "assets", "themes");
const USER_THEMES_DIR = path.join(app.getPath("userData"), "themes");

function ensureUserThemesDir() {
  if (!fs.existsSync(USER_THEMES_DIR)) {
    fs.mkdirSync(USER_THEMES_DIR, { recursive: true });
  }

  // Copiar archivos de ejemplo si no existen
  const examples = ["template-example.json", "README.md"];
  examples.forEach(file => {
    const src = path.join(BUILTIN_THEMES_DIR, file);
    const dest = path.join(USER_THEMES_DIR, file);
    if (fs.existsSync(src) && !fs.existsSync(dest)) {
      try {
        fs.copyFileSync(src, dest);
      } catch (e) {
        console.error("Error copying example theme file:", file, e);
      }
    }
  });
}

function getThemeList() {
  ensureUserThemesDir();
  const themes = [];

  // Load builtin
  if (fs.existsSync(BUILTIN_THEMES_DIR)) {
    const builtinFiles = fs.readdirSync(BUILTIN_THEMES_DIR);
    builtinFiles.forEach((file) => {
      if (file.endsWith(".json")) {
        try {
          const content = JSON.parse(fs.readFileSync(path.join(BUILTIN_THEMES_DIR, file), "utf-8"));
          themes.push({
            id: content.id,
            name: content.name,
            type: content.type,
            isUserTheme: false,
            path: path.join(BUILTIN_THEMES_DIR, file),
          });
        } catch (e) {
          console.error("Error loading builtin theme:", file, e);
        }
      }
    });
  }

  // Load user themes
  const userFiles = fs.readdirSync(USER_THEMES_DIR);
  userFiles.forEach((file) => {
    if (file.endsWith(".json")) {
      try {
        const content = JSON.parse(fs.readFileSync(path.join(USER_THEMES_DIR, file), "utf-8"));
        themes.push({
          id: content.id,
          name: content.name,
          type: content.type,
          isUserTheme: true,
          path: path.join(USER_THEMES_DIR, file),
        });
      } catch (e) {
        console.error("Error loading user theme:", file, e);
      }
    }
  });

  return themes;
}

function getThemeData(themeId) {
  const list = getThemeList();
  const themeInfo = list.find((t) => t.id === themeId);
  if (!themeInfo) return null;

  try {
    return JSON.parse(fs.readFileSync(themeInfo.path, "utf-8"));
  } catch (e) {
    console.error("Error reading theme data:", themeId, e);
    return null;
  }
}

function openThemesFolder() {
  ensureUserThemesDir();
  shell.openPath(USER_THEMES_DIR);
}

module.exports = {
  getThemeList,
  getThemeData,
  openThemesFolder,
};
