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
const electron_1 = require("electron");
const window_1 = require("./main-process/window");
const serial_1 = require("./main-process/serial");
const media_1 = require("./main-process/media");
const keyboard_1 = require("./main-process/keyboard");
const execution_1 = require("./main-process/execution");
const persistence_1 = require("./main-process/persistence");
const tray_1 = require("./main-process/tray");
const themes_1 = require("./main-process/themes");
const updater_1 = require("./main-process/updater");
const path = __importStar(require("path"));
const fs = __importStar(require("fs"));
// Forzar el nombre correcto en notificaciones de Windows
electron_1.app.setAppUserModelId("PokePad");
// Habilitar hot reload en desarrollo
if (!electron_1.app.isPackaged) {
    try {
        require("electron-reload")(__dirname, {
            electron: path.join(__dirname, "node_modules", ".bin", "electron"),
        });
    }
    catch (err) {
        console.error("electron-reload failed to initialize", err);
    }
}
// Bloqueo de instancia única
const gotTheLock = electron_1.app.requestSingleInstanceLock();
if (!gotTheLock) {
    electron_1.app.quit();
}
else {
    electron_1.app.on("second-instance", (_event, _commandLine, _workingDirectory) => {
        const win = (0, window_1.getWindow)();
        if (win) {
            if (win.isMinimized())
                win.restore();
            win.show();
            win.focus();
        }
    });
    electron_1.app.on("before-quit", () => {
        electron_1.app.isQuiting = true;
    });
    let selectionResolve = null;
    function promptForRegion() {
        return new Promise((resolve) => {
            selectionResolve = resolve;
            (0, window_1.createSelectionWindow)();
        });
    }
    // Inicialización de la App
    electron_1.app.whenReady().then(() => {
        let startupMode = "normal";
        if (process.argv.includes("--was-opened-at-login")) {
            const arg = process.argv.find(a => a.startsWith("--startup-mode="));
            if (arg)
                startupMode = arg.split("=")[1];
        }
        const mainWindow = (0, window_1.createWindow)(startupMode);
        if (mainWindow) {
            (0, tray_1.setupTray)(mainWindow);
            (0, updater_1.setupUpdater)(mainWindow);
        }
        (0, serial_1.setupSerial)();
        (0, media_1.setupMedia)();
        (0, keyboard_1.setupKeyboard)();
        (0, execution_1.setupExecution)(promptForRegion); // Pass promptForRegion to execution
        (0, persistence_1.setupPersistence)();
        electron_1.ipcMain.handle("select-file", async () => {
            const win = (0, window_1.getWindow)();
            if (!win)
                return null;
            const { canceled, filePaths } = await electron_1.dialog.showOpenDialog(win, {
                properties: ["openFile"],
                filters: [
                    { name: "Aplicaciones", extensions: ["exe", "lnk", "app", "bat", "cmd"] },
                    { name: "Todos los archivos", extensions: ["*"] }
                ]
            });
            if (canceled)
                return null;
            return filePaths[0];
        });
        electron_1.ipcMain.on("open-config-window", () => {
            (0, window_1.createConfigWindow)();
        });
        electron_1.ipcMain.on("open-about-window", () => {
            (0, window_1.createAboutWindow)();
        });
        electron_1.ipcMain.on("open-theme-preview", (event) => {
            const parent = electron_1.BrowserWindow.fromWebContents(event.sender);
            if (parent)
                (0, window_1.createThemePreviewWindow)(parent);
        });
        electron_1.ipcMain.handle("get-app-version", () => {
            return electron_1.app.getVersion();
        });
        electron_1.ipcMain.handle("list-running-apps", () => (0, keyboard_1.listRunningApps)());
        electron_1.ipcMain.handle("list-installed-apps", () => (0, keyboard_1.listInstalledApps)());
        electron_1.ipcMain.handle("file-exists", (_event, filePath) => {
            if (!filePath || typeof filePath !== 'string')
                return false;
            try {
                const cleanPath = filePath.trim().replace(/^["']|["']$/g, '');
                // Si empieza con un protocolo conocido de Windows/MacOS que no es filesystem directo
                if (/^(shell:|mailto:|http:|https:|file:)/i.test(cleanPath)) {
                    return true;
                }
                const normalized = path.normalize(cleanPath);
                const exists = fs.existsSync(normalized);
                console.log(`[file-exists] Path: "${normalized}" -> ${exists}`);
                return exists;
            }
            catch (e) {
                console.error(`[file-exists] Error checking "${filePath}":`, e);
                return false;
            }
        });
        electron_1.ipcMain.handle("get-themes", () => (0, themes_1.getThemeList)());
        electron_1.ipcMain.handle("get-theme-data", (_event, themeId) => (0, themes_1.getThemeData)(themeId));
        electron_1.ipcMain.handle("import-external-theme", () => (0, themes_1.importExternalTheme)());
        electron_1.ipcMain.on("open-themes-folder", () => (0, themes_1.openThemesFolder)());
        electron_1.ipcMain.on("theme-changed", () => {
            electron_1.BrowserWindow.getAllWindows().forEach((win) => {
                win.webContents.send("apply-theme");
            });
        });
        // Watch for theme file changes to trigger real-time updates
        let themeWatchTimeout = null;
        const watchThemes = (dir, name) => {
            try {
                if (!fs.existsSync(dir))
                    return;
                // Don't watch ASAR paths as fs.watch doesn't support them and throws
                if (dir.includes('.asar')) {
                    console.log(`[main] Skipping watch for ${name} (ASAR path)`);
                    return;
                }
                fs.watch(dir, (_eventType, filename) => {
                    if (filename && filename.endsWith('.json')) {
                        if (themeWatchTimeout)
                            clearTimeout(themeWatchTimeout);
                        themeWatchTimeout = setTimeout(() => {
                            console.log(`[main] Theme directory changed (${name}): ${filename}, notifying windows.`);
                            electron_1.BrowserWindow.getAllWindows().forEach((win) => {
                                win.webContents.send("apply-theme");
                            });
                        }, 200);
                    }
                });
                console.log(`[main] Watching ${name} for changes: ${dir}`);
            }
            catch (e) {
                console.warn(`[main] Failed to watch ${name}:`, e.message);
            }
        };
        const BUILTIN_THEMES_DIR = path.join(__dirname, "assets", "themes");
        const USER_THEMES_DIR = path.join(electron_1.app.getPath("userData"), "themes");
        // Only watch builtin themes in development
        if (!electron_1.app.isPackaged) {
            watchThemes(BUILTIN_THEMES_DIR, "builtin themes");
        }
        watchThemes(USER_THEMES_DIR, "user themes");
        electron_1.ipcMain.on("win-minimize", (event) => {
            const win = electron_1.BrowserWindow.fromWebContents(event.sender);
            if (win)
                win.minimize();
        });
        electron_1.ipcMain.on("win-maximize", (event) => {
            const win = electron_1.BrowserWindow.fromWebContents(event.sender);
            if (win) {
                win.isMaximized() ? win.unmaximize() : win.maximize();
            }
        });
        electron_1.ipcMain.on("win-close", (event) => {
            const win = electron_1.BrowserWindow.fromWebContents(event.sender);
            if (win)
                win.close();
        });
        // Region Selection Handlers
        electron_1.ipcMain.on("start-region-selection", () => {
            (0, window_1.createSelectionWindow)();
        });
        electron_1.ipcMain.on("finish-region-selection", (event, rect) => {
            const win = electron_1.BrowserWindow.fromWebContents(event.sender);
            if (win)
                win.close();
            if (selectionResolve) {
                selectionResolve(rect);
                selectionResolve = null;
            }
            else {
                const mainWin = (0, window_1.getWindow)();
                if (mainWin)
                    mainWin.webContents.send("region-selection-complete", rect);
            }
        });
        electron_1.ipcMain.on("cancel-region-selection", (event) => {
            const win = electron_1.BrowserWindow.fromWebContents(event.sender);
            if (win)
                win.close();
            if (selectionResolve) {
                selectionResolve(null);
                selectionResolve = null;
            }
        });
    });
    electron_1.app.on("window-all-closed", () => {
        if (process.platform !== "darwin")
            electron_1.app.quit();
    });
    electron_1.app.on("activate", () => {
        if ((0, window_1.getWindow)() === null)
            (0, window_1.createWindow)();
    });
}
