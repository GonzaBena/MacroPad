const { app, ipcMain, dialog } = require("electron");
const { getWindow } = require("./window");
const fs = require("fs");
const path = require("path");

const DATA_FILENAME = "pokepad-data.json";
const BACKUP_FILENAME = "pokepad-data.bak.json";

function getDataPath() {
  return path.join(app.getPath("userData"), DATA_FILENAME);
}

function getBackupPath() {
  return path.join(app.getPath("userData"), BACKUP_FILENAME);
}

/**
 * Validate the basic shape of persisted data.
 * Returns sanitized data object.
 */
function validateData(raw) {
  const data = {
    signals: {},
    config: {
      theme: "dark",
      closeBehavior: "close",
      accentColor: "#f5a623",
    },
  };

  if (!raw || typeof raw !== "object") return data;

  // Validate config
  if (raw.config && typeof raw.config === "object") {
    if (typeof raw.config.theme === "string") data.config.theme = raw.config.theme;
    if (typeof raw.config.closeBehavior === "string") data.config.closeBehavior = raw.config.closeBehavior;
    if (typeof raw.config.accentColor === "string" && /^#[0-9A-Fa-f]{6}$/.test(raw.config.accentColor)) {
      data.config.accentColor = raw.config.accentColor;
    }
  }

  // Validate signals
  if (raw.signals && typeof raw.signals === "object") {
    for (const [key, val] of Object.entries(raw.signals)) {
      if (!val || typeof val !== "object") continue;

      data.signals[key] = {
        label: typeof val.label === "string" ? val.label : "",
        color: typeof val.color === "string" ? val.color : "#f5a623",
        assignedToButton: (function() {
          if (val.assignedToButton === true) return "RAPIDA";
          if (["RAPIDA", "MEDIA", "LENTA"].includes(val.assignedToButton)) return val.assignedToButton;
          return false;
        })(),
        steps: Array.isArray(val.steps)
          ? val.steps.filter(
              (s) => s && typeof s === "object" && typeof s.type === "string"
            )
          : [],
      };
    }
  }

  return data;
}

/**
 * Load data from file. Falls back to backup, then defaults.
 */
function loadData() {
  const dataPath = getDataPath();
  const backupPath = getBackupPath();

  // Try main file first
  for (const filePath of [dataPath, backupPath]) {
    try {
      if (fs.existsSync(filePath)) {
        const raw = JSON.parse(fs.readFileSync(filePath, "utf-8"));
        const validated = validateData(raw);
        console.log(`[persistence] Loaded data from ${path.basename(filePath)}`);
        return validated;
      }
    } catch (err) {
      console.error(`[persistence] Failed to load ${path.basename(filePath)}:`, err.message);
    }
  }

  console.log("[persistence] No existing data found, using defaults");
  return validateData(null);
}

/**
 * Save data to file with backup rotation.
 */
function saveData(data) {
  const dataPath = getDataPath();
  const backupPath = getBackupPath();

  try {
    // Rotate current file to backup
    if (fs.existsSync(dataPath)) {
      fs.copyFileSync(dataPath, backupPath);
    }

    const validated = validateData(data);
    fs.writeFileSync(dataPath, JSON.stringify(validated, null, 2), "utf-8");
  } catch (err) {
    console.error("[persistence] Failed to save data:", err.message);
  }
}

/**
 * Export data to user-chosen file.
 */
async function exportData() {
  const win = getWindow();
  if (!win) return { ok: false, error: "No window" };

  const { canceled, filePath } = await dialog.showSaveDialog(win, {
    title: "Exportar configuración de PokePad",
    defaultPath: "pokepad-config.json",
    filters: [{ name: "JSON", extensions: ["json"] }],
  });

  if (canceled || !filePath) return { ok: false, error: "Cancelled" };

  try {
    const data = loadData();
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2), "utf-8");
    return { ok: true, path: filePath };
  } catch (err) {
    return { ok: false, error: err.message };
  }
}

/**
 * Import data from user-chosen file.
 */
async function importData() {
  const win = getWindow();
  if (!win) return { ok: false, error: "No window" };

  const { canceled, filePaths } = await dialog.showOpenDialog(win, {
    title: "Importar configuración de PokePad",
    filters: [{ name: "JSON", extensions: ["json"] }],
    properties: ["openFile"],
  });

  if (canceled || !filePaths.length) return { ok: false, error: "Cancelled" };

  try {
    const raw = JSON.parse(fs.readFileSync(filePaths[0], "utf-8"));
    const validated = validateData(raw);
    saveData(validated);
    return { ok: true, data: validated };
  } catch (err) {
    return { ok: false, error: err.message };
  }
}

function setupPersistence() {
  ipcMain.handle("load-data", () => loadData());

  ipcMain.handle("save-data", (_, data) => {
    saveData(data);
    return { ok: true };
  });

  ipcMain.handle("export-data", () => exportData());
  ipcMain.handle("import-data", () => importData());

  ipcMain.handle("export-single-workflow", async (_, { name, data }) => {
    const win = getWindow();
    if (!win) return { ok: false, error: "No window" };

    const { canceled, filePath } = await dialog.showSaveDialog(win, {
      title: `Exportar workflow: ${name}`,
      defaultPath: `workflow-${name.toLowerCase()}.json`,
      filters: [{ name: "JSON", extensions: ["json"] }],
    });

    if (canceled || !filePath) return { ok: false, error: "Cancelled" };

    try {
      fs.writeFileSync(filePath, JSON.stringify({ version: "1.0", type: "single-workflow", name, data }, null, 2), "utf-8");
      return { ok: true, path: filePath };
    } catch (err) {
      return { ok: false, error: err.message };
    }
  });

  ipcMain.handle("import-single-workflow", async () => {
    const win = getWindow();
    if (!win) return { ok: false, error: "No window" };

    const { canceled, filePaths } = await dialog.showOpenDialog(win, {
      title: "Importar workflow",
      filters: [{ name: "JSON", extensions: ["json"] }],
      properties: ["openFile"],
    });

    if (canceled || !filePaths.length) return { ok: false, error: "Cancelled" };

    try {
      const raw = JSON.parse(fs.readFileSync(filePaths[0], "utf-8"));
      if (raw.type !== "single-workflow" || !raw.name || !raw.data) {
        throw new Error("Formato de workflow inválido");
      }
      return { ok: true, name: raw.name, data: raw.data };
    } catch (err) {
      return { ok: false, error: err.message };
    }
  });
}

module.exports = {
  setupPersistence,
  loadData,
  saveData,
  validateData,
};
