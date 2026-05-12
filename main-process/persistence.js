"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.validateData = validateData;
exports.loadData = loadData;
exports.saveData = saveData;
exports.setupPersistence = setupPersistence;
const electron_1 = require("electron");
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
// @ts-ignore
const window_1 = require("./window");
const DATA_FILENAME = "pokepad-data.json";
const BACKUP_FILENAME = "pokepad-data.bak.json";
function getDataPath() {
    return path.join(electron_1.app.getPath("userData"), DATA_FILENAME);
}
function getBackupPath() {
    return path.join(electron_1.app.getPath("userData"), BACKUP_FILENAME);
}
/**
 * Validate the basic shape of persisted data.
 * Returns sanitized data object.
 */
function validateData(raw) {
    const data = {
        signals: {},
        folders: [],
        globalVariables: {},
        config: {
            theme: "dark",
            closeBehavior: "close",
            accentColor: "#f5a623",
            initialTab: "monitor",
            workflowSort: "original",
        },
    };
    if (!raw || typeof raw !== "object")
        return data;
    // Validate config
    if (raw.config && typeof raw.config === "object") {
        if (typeof raw.config.theme === "string")
            data.config.theme = raw.config.theme;
        if (typeof raw.config.closeBehavior === "string")
            data.config.closeBehavior = raw.config.closeBehavior;
        if (typeof raw.config.initialTab === "string")
            data.config.initialTab = raw.config.initialTab;
        if (typeof raw.config.startupMode === "string")
            data.config.startupMode = raw.config.startupMode;
        if (typeof raw.config.workflowSort === "string")
            data.config.workflowSort = raw.config.workflowSort;
        if (typeof raw.config.accentColor === "string" && /^#[0-9A-Fa-f]{6}$/.test(raw.config.accentColor)) {
            data.config.accentColor = raw.config.accentColor;
        }
    }
    // Validate folders
    if (Array.isArray(raw.folders)) {
        data.folders = raw.folders
            .filter((f) => f && typeof f === "object" && typeof f.id === "string" && typeof f.name === "string")
            .map((f) => ({
            id: f.id,
            name: f.name,
            expanded: f.expanded !== false,
            color: typeof f.color === "string" && /^#[0-9A-Fa-f]{6}$/.test(f.color) ? f.color : null,
        }));
    }
    // Validate signals
    if (raw.signals && typeof raw.signals === "object") {
        for (const [key, val] of Object.entries(raw.signals)) {
            if (!val || typeof val !== "object")
                continue;
            const v = val;
            data.signals[key] = {
                label: typeof v.label === "string" ? v.label : "",
                color: typeof v.color === "string" ? v.color : "#f5a623",
                folderId: typeof v.folderId === "string" ? v.folderId : null,
                assignedApp: typeof v.assignedApp === "string" ? v.assignedApp : null,
                createdAt: typeof v.createdAt === "number" ? v.createdAt : 0,
                runCount: typeof v.runCount === "number" ? v.runCount : 0,
                assignedToButton: Array.isArray(v.assignedToButton)
                    ? v.assignedToButton.filter((s) => ["RAPIDA", "MEDIA", "LENTA"].includes(s))
                    : (function () {
                        if (v.assignedToButton === true)
                            return ["RAPIDA"];
                        if (["RAPIDA", "MEDIA", "LENTA"].includes(v.assignedToButton))
                            return [v.assignedToButton];
                        return [];
                    })(),
                steps: Array.isArray(v.steps)
                    ? v.steps.filter((s) => s && typeof s === "object" && typeof s.type === "string")
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
        }
        catch (err) {
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
        // Apply launch at login setting
        if (electron_1.app.isPackaged) {
            const startupMode = validated.config.startupMode || "none";
            electron_1.app.setLoginItemSettings({
                openAtLogin: startupMode !== "none",
                path: electron_1.app.getPath("exe"),
                args: [
                    "--was-opened-at-login",
                    `--startup-mode=${startupMode}`
                ]
            });
        }
    }
    catch (err) {
        console.error("[persistence] Failed to save data:", err.message);
    }
}
/**
 * Export data to user-chosen file.
 */
async function exportData() {
    const win = (0, window_1.getWindow)();
    if (!win)
        return { ok: false, error: "No window" };
    const { canceled, filePath } = await electron_1.dialog.showSaveDialog(win, {
        title: "Exportar configuración de PokePad",
        defaultPath: "pokepad-config.json",
        filters: [{ name: "JSON", extensions: ["json"] }],
    });
    if (canceled || !filePath)
        return { ok: false, error: "Cancelled" };
    try {
        const data = loadData();
        fs.writeFileSync(filePath, JSON.stringify(data, null, 2), "utf-8");
        return { ok: true, path: filePath };
    }
    catch (err) {
        return { ok: false, error: err.message };
    }
}
/**
 * Import data from user-chosen file.
 */
async function importData() {
    const win = (0, window_1.getWindow)();
    if (!win)
        return { ok: false, error: "No window" };
    const { canceled, filePaths } = await electron_1.dialog.showOpenDialog(win, {
        title: "Importar configuración de PokePad",
        filters: [{ name: "JSON", extensions: ["json"] }],
        properties: ["openFile"],
    });
    if (canceled || !filePaths.length)
        return { ok: false, error: "Cancelled" };
    try {
        const raw = JSON.parse(fs.readFileSync(filePaths[0], "utf-8"));
        const validated = validateData(raw);
        saveData(validated);
        return { ok: true, data: validated };
    }
    catch (err) {
        return { ok: false, error: err.message };
    }
}
function setupPersistence() {
    electron_1.ipcMain.handle("load-data", () => loadData());
    electron_1.ipcMain.handle("save-data", (_, data) => {
        saveData(data);
        return { ok: true };
    });
    electron_1.ipcMain.handle("export-data", () => exportData());
    electron_1.ipcMain.handle("import-data", () => importData());
    electron_1.ipcMain.handle("export-single-workflow", async (_, { name, data }) => {
        const win = (0, window_1.getWindow)();
        if (!win)
            return { ok: false, error: "No window" };
        const { canceled, filePath } = await electron_1.dialog.showSaveDialog(win, {
            title: `Exportar workflow: ${name}`,
            defaultPath: `workflow-${name.toLowerCase()}.json`,
            filters: [{ name: "JSON", extensions: ["json"] }],
        });
        if (canceled || !filePath)
            return { ok: false, error: "Cancelled" };
        try {
            fs.writeFileSync(filePath, JSON.stringify({ version: "1.0", type: "single-workflow", name, data }, null, 2), "utf-8");
            return { ok: true, path: filePath };
        }
        catch (err) {
            return { ok: false, error: err.message };
        }
    });
    electron_1.ipcMain.handle("import-single-workflow", async () => {
        const win = (0, window_1.getWindow)();
        if (!win)
            return { ok: false, error: "No window" };
        const { canceled, filePaths } = await electron_1.dialog.showOpenDialog(win, {
            title: "Importar workflow",
            filters: [{ name: "JSON", extensions: ["json"] }],
            properties: ["openFile"],
        });
        if (canceled || !filePaths.length)
            return { ok: false, error: "Cancelled" };
        try {
            const raw = JSON.parse(fs.readFileSync(filePaths[0], "utf-8"));
            if (raw.type !== "single-workflow" || !raw.name || !raw.data) {
                throw new Error("Formato de workflow inválido");
            }
            return { ok: true, name: raw.name, data: raw.data };
        }
        catch (err) {
            return { ok: false, error: err.message };
        }
    });
    electron_1.ipcMain.handle("export-folder", async (_, { folderName, workflows }) => {
        const win = (0, window_1.getWindow)();
        if (!win)
            return { ok: false, error: "No window" };
        const safeName = folderName.toLowerCase().replace(/\s+/g, "-");
        const { canceled, filePath } = await electron_1.dialog.showSaveDialog(win, {
            title: `Exportar carpeta: ${folderName}`,
            defaultPath: `folder-${safeName}.json`,
            filters: [{ name: "JSON", extensions: ["json"] }],
        });
        if (canceled || !filePath)
            return { ok: false, error: "Cancelled" };
        try {
            const payload = { version: "1.0", type: "folder", name: folderName, workflows };
            fs.writeFileSync(filePath, JSON.stringify(payload, null, 2), "utf-8");
            return { ok: true, path: filePath };
        }
        catch (err) {
            return { ok: false, error: err.message };
        }
    });
    electron_1.ipcMain.handle("import-folder", async () => {
        const win = (0, window_1.getWindow)();
        if (!win)
            return { ok: false, error: "No window" };
        const { canceled, filePaths } = await electron_1.dialog.showOpenDialog(win, {
            title: "Importar carpeta",
            filters: [{ name: "JSON", extensions: ["json"] }],
            properties: ["openFile"],
        });
        if (canceled || !filePaths.length)
            return { ok: false, error: "Cancelled" };
        try {
            const raw = JSON.parse(fs.readFileSync(filePaths[0], "utf-8"));
            if (raw.type !== "folder" || !raw.name || !raw.workflows) {
                throw new Error("Formato de carpeta inválido");
            }
            return { ok: true, name: raw.name, workflows: raw.workflows };
        }
        catch (err) {
            return { ok: false, error: err.message };
        }
    });
}
