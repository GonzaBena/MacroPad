import { app, ipcMain, dialog } from "electron";
import * as fs from "fs";
import * as path from "path";
import log from './logger';
// @ts-ignore
import { getWindow } from "./window";
import { ExportSingleWorkflowSchema, ExportFolderSchema } from "../src/types/ipc-schemas";

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
export function validateData(raw: any) {
  const data: any = {
    signals: {},
    folders: [],
    globalVariables: {},
    stats: { sig: 0, act: 0, err: 0, success: 0, failure: 0 },
    history: [],
    config: {
      theme: "dark",
      closeBehavior: "close",
      accentColor: "#f5a623",
      initialTab: "monitor",
      workflowSort: "original",
    },
  };

  if (!raw || typeof raw !== "object") return data;

  // Validate config
  if (raw.config && typeof raw.config === "object") {
    if (typeof raw.config.theme === "string") data.config.theme = raw.config.theme;
    if (typeof raw.config.closeBehavior === "string") data.config.closeBehavior = raw.config.closeBehavior;
    if (typeof raw.config.initialTab === "string") data.config.initialTab = raw.config.initialTab;
    if (typeof raw.config.startupMode === "string") data.config.startupMode = raw.config.startupMode;
    if (typeof raw.config.workflowSort === "string") data.config.workflowSort = raw.config.workflowSort;
    if (typeof raw.config.accentColor === "string" && /^#[0-9A-Fa-f]{6}$/.test(raw.config.accentColor)) {
      data.config.accentColor = raw.config.accentColor;
    }
  }

  // Validate folders
  if (Array.isArray(raw.folders)) {
    data.folders = raw.folders
      .filter((f: any) => f && typeof f === "object" && typeof f.id === "string" && typeof f.name === "string")
      .map((f: any) => ({
        id: f.id,
        name: f.name,
        expanded: f.expanded !== false,
        color: typeof f.color === "string" && /^#[0-9A-Fa-f]{6}$/.test(f.color) ? f.color : null,
      }));
  }

  // Validate signals
  if (raw.signals && typeof raw.signals === "object") {
    for (const [key, val] of Object.entries(raw.signals)) {
      if (!val || typeof val !== "object") continue;
      const v = val as any;

      data.signals[key] = {
        label: typeof v.label === "string" ? v.label : "",
        color: typeof v.color === "string" ? v.color : "#f5a623",
        folderId: typeof v.folderId === "string" ? v.folderId : null,
        assignedApp: typeof v.assignedApp === "string" ? v.assignedApp : null,
        createdAt: typeof v.createdAt === "number" ? v.createdAt : 0,
        runCount: typeof v.runCount === "number" ? v.runCount : 0,
        assignedToButton: Array.isArray(v.assignedToButton)
          ? v.assignedToButton.filter((s: any) => ["RAPIDA", "MEDIA", "LENTA"].includes(s))
          : (function() {
              if (v.assignedToButton === true) return ["RAPIDA"];
              if (["RAPIDA", "MEDIA", "LENTA"].includes(v.assignedToButton)) return [v.assignedToButton];
              return [];
            })(),
        steps: Array.isArray(v.steps)
          ? v.steps.filter(
              (s: any) => s && typeof s === "object" && typeof s.type === "string"
            )
          : [],
      };
    }
  }

  // Validate globalVariables
  if (raw.globalVariables && typeof raw.globalVariables === "object" && !Array.isArray(raw.globalVariables)) {
    for (const [key, val] of Object.entries(raw.globalVariables)) {
      if (typeof key === "string" && key.length > 0) {
        data.globalVariables[key] = val;
      }
    }
  }

  // Validate stats — preserve cumulative counters across restarts and updates
  if (raw.stats && typeof raw.stats === "object") {
    const s = raw.stats;
    if (typeof s.sig     === "number") data.stats.sig     = s.sig;
    if (typeof s.act     === "number") data.stats.act     = s.act;
    if (typeof s.err     === "number") data.stats.err     = s.err;
    if (typeof s.success === "number") data.stats.success = s.success;
    if (typeof s.failure === "number") data.stats.failure = s.failure;
  }

  // Validate history — keep up to 500 most recent entries
  if (Array.isArray(raw.history)) {
    data.history = raw.history
      .filter((h: any) =>
        h && typeof h === "object" &&
        typeof h.signal    === "string" &&
        typeof h.success   === "boolean" &&
        typeof h.timestamp === "number"
      )
      .map((h: any) => ({
        signal:    h.signal,
        label:     typeof h.label === "string" ? h.label : h.signal,
        success:   h.success,
        timestamp: h.timestamp,
      }))
      .slice(0, 500);
  }

  return data;
}

/**
 * Load data from file. Falls back to backup, then defaults.
 */
export function loadData() {
  const dataPath = getDataPath();
  const backupPath = getBackupPath();

  // Try main file first
  for (const filePath of [dataPath, backupPath]) {
    try {
      if (fs.existsSync(filePath)) {
        const raw = JSON.parse(fs.readFileSync(filePath, "utf-8"));
        const validated = validateData(raw);
        log.info(`[persistence] Loaded data from ${path.basename(filePath)}`);
        return validated;
      }
    } catch (err: any) {
      log.error(`[persistence] Failed to load ${path.basename(filePath)}:`, err.message);
    }
  }

  log.info("[persistence] No existing data found, using defaults");
  return validateData(null);
}

/**
 * Save data to file with backup rotation.
 */
export function saveData(data: any) {
  const dataPath = getDataPath();
  const backupPath = getBackupPath();

  try {
    // Rotate current file to backup
    if (fs.existsSync(dataPath)) {
      fs.copyFileSync(dataPath, backupPath);
    }

    const validated = validateData(data);
    fs.writeFileSync(dataPath, JSON.stringify(validated, null, 2), "utf-8");

    // Apply launch at login setting
    if (app.isPackaged) {
      const startupMode = validated.config.startupMode || "none";
      app.setLoginItemSettings({
        openAtLogin: startupMode !== "none",
        path: app.getPath("exe"),
        args: [
          "--was-opened-at-login",
          `--startup-mode=${startupMode}`
        ]
      });
    }
  } catch (err: any) {
    log.error("[persistence] Failed to save data:", err.message);
  }
}

/**
 * Export data to user-chosen file.
 */
async function exportData(): Promise<any> {
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
  } catch (err: any) {
    return { ok: false, error: err.message };
  }
}

/**
 * Import data from user-chosen file.
 */
async function importData(): Promise<any> {
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
  } catch (err: any) {
    return { ok: false, error: err.message };
  }
}

export function setupPersistence() {
  ipcMain.handle("load-data", () => loadData());

  ipcMain.handle("save-data", (_, data: unknown) => {
    if (data === null || typeof data !== "object" || Array.isArray(data)) {
      log.warn("[persistence] Received invalid data payload for save-data");
      return { ok: false };
    }
    saveData(data);
    return { ok: true };
  });

  ipcMain.handle("export-data", () => exportData());
  ipcMain.handle("import-data", () => importData());

  ipcMain.handle("export-single-workflow", async (_, payload: unknown) => {
    const parsed = ExportSingleWorkflowSchema.safeParse(payload);
    if (!parsed.success) return { ok: false, error: "Payload inválido" };
    const { name, data } = parsed.data;

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
    } catch (err: any) {
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
    } catch (err: any) {
      return { ok: false, error: err.message };
    }
  });

  ipcMain.handle("export-folder", async (_, payload: unknown) => {
    const parsed = ExportFolderSchema.safeParse(payload);
    if (!parsed.success) return { ok: false, error: "Payload inválido" };
    const { folderName, workflows } = parsed.data;

    const win = getWindow();
    if (!win) return { ok: false, error: "No window" };

    const safeName = folderName.toLowerCase().replace(/\s+/g, "-");
    const { canceled, filePath } = await dialog.showSaveDialog(win, {
      title: `Exportar carpeta: ${folderName}`,
      defaultPath: `folder-${safeName}.json`,
      filters: [{ name: "JSON", extensions: ["json"] }],
    });

    if (canceled || !filePath) return { ok: false, error: "Cancelled" };

    try {
      const payload = { version: "1.0", type: "folder", name: folderName, workflows };
      fs.writeFileSync(filePath, JSON.stringify(payload, null, 2), "utf-8");
      return { ok: true, path: filePath };
    } catch (err: any) {
      return { ok: false, error: err.message };
    }
  });

  ipcMain.handle("import-folder", async () => {
    const win = getWindow();
    if (!win) return { ok: false, error: "No window" };

    const { canceled, filePaths } = await dialog.showOpenDialog(win, {
      title: "Importar carpeta",
      filters: [{ name: "JSON", extensions: ["json"] }],
      properties: ["openFile"],
    });

    if (canceled || !filePaths.length) return { ok: false, error: "Cancelled" };

    try {
      const raw = JSON.parse(fs.readFileSync(filePaths[0], "utf-8"));
      if (raw.type !== "folder" || !raw.name || !raw.workflows) {
        throw new Error("Formato de carpeta inválido");
      }
      return { ok: true, name: raw.name, workflows: raw.workflows };
    } catch (err: any) {
      return { ok: false, error: err.message };
    }
  });
}
