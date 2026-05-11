const { app, ipcMain, dialog, BrowserWindow } = require("electron");
const {
  createWindow,
  getWindow,
  createConfigWindow,
  createAboutWindow,
  createThemePreviewWindow,
  createSelectionWindow,
} = require("./main-process/window");
const { setupSerial } = require("./main-process/serial");
const { setupMedia } = require("./main-process/media");
const { setupKeyboard, listRunningApps, listInstalledApps } = require("./main-process/keyboard");
const { setupExecution } = require("./main-process/execution");
const { setupPersistence } = require("./main-process/persistence");
const { setupTray } = require("./main-process/tray");
const { getThemeList, getThemeData, openThemesFolder, importExternalTheme } = require("./main-process/themes");
const { setupUpdater } = require("./main-process/updater");
const path = require("path");
const fs = require("fs");

// Forzar el nombre correcto en notificaciones de Windows
app.setAppUserModelId("PokePad");

// Habilitar hot reload en desarrollo
if (!app.isPackaged) {
  try {
    require("electron-reload")(__dirname, {
      electron: path.join(__dirname, "node_modules", ".bin", "electron"),
    });
  } catch (err) {
    console.error("electron-reload failed to initialize", err);
  }
}

// Bloqueo de instancia única
const gotTheLock = app.requestSingleInstanceLock();

if (!gotTheLock) {
  app.quit();
} else {
  app.on("second-instance", (event, commandLine, workingDirectory) => {
    const win = getWindow();
    if (win) {
      if (win.isMinimized()) win.restore();
      win.show();
      win.focus();
    }
  });

  app.on("before-quit", () => {
    app.isQuiting = true;
  });

  let selectionResolve = null;

  function promptForRegion() {
    return new Promise((resolve) => {
      selectionResolve = resolve;
      createSelectionWindow();
    });
  }

  // Inicialización de la App
  app.whenReady().then(() => {
    let startupMode = "normal";
    if (process.argv.includes("--was-opened-at-login")) {
      const arg = process.argv.find(a => a.startsWith("--startup-mode="));
      if (arg) startupMode = arg.split("=")[1];
    }

    const mainWindow = createWindow(startupMode);
    setupTray(mainWindow);
    setupUpdater(mainWindow);

    setupSerial();
    setupMedia();
    setupKeyboard();
    setupExecution(promptForRegion); // Pass promptForRegion to execution
    setupPersistence();

    ipcMain.handle("select-file", async () => {
      const win = getWindow();
      if (!win) return null;
      const { canceled, filePaths } = await dialog.showOpenDialog(win, {
        properties: ["openFile"],
        filters: [
          { name: "Aplicaciones", extensions: ["exe", "lnk", "app", "bat", "cmd"] },
          { name: "Todos los archivos", extensions: ["*"] }
        ]
      });
      if (canceled) return null;
      return filePaths[0];
    });

    ipcMain.on("open-config-window", () => {
      createConfigWindow();
    });

    ipcMain.on("open-about-window", () => {
      createAboutWindow();
    });

    ipcMain.on("open-theme-preview", (event) => {
      const parent = BrowserWindow.fromWebContents(event.sender);
      createThemePreviewWindow(parent);
    });

    ipcMain.handle("get-app-version", () => {
      return app.getVersion();
    });

    ipcMain.handle("list-running-apps", () => listRunningApps());
    ipcMain.handle("list-installed-apps", () => listInstalledApps());
    ipcMain.handle("file-exists", (event, filePath) => {
      if (!filePath || typeof filePath !== 'string') return false;
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
      } catch (e) {
        console.error(`[file-exists] Error checking "${filePath}":`, e);
        return false;
      }
    });

    ipcMain.handle("get-themes", () => getThemeList());
    ipcMain.handle("get-theme-data", (event, themeId) => getThemeData(themeId));
    ipcMain.handle("import-external-theme", () => importExternalTheme());
    ipcMain.on("open-themes-folder", () => openThemesFolder());

    ipcMain.on("theme-changed", () => {
      BrowserWindow.getAllWindows().forEach((win) => {
        win.webContents.send("apply-theme");
      });
    });

    // Watch for theme file changes to trigger real-time updates
    let themeWatchTimeout = null;
    const watchThemes = (dir, name) => {
      try {
        if (!fs.existsSync(dir)) return;
        
        // Don't watch ASAR paths as fs.watch doesn't support them and throws
        if (dir.includes('.asar')) {
          console.log(`[main] Skipping watch for ${name} (ASAR path)`);
          return;
        }

        fs.watch(dir, (eventType, filename) => {
          if (filename && filename.endsWith('.json')) {
            if (themeWatchTimeout) clearTimeout(themeWatchTimeout);
            themeWatchTimeout = setTimeout(() => {
              console.log(`[main] Theme directory changed (${name}): ${filename}, notifying windows.`);
              BrowserWindow.getAllWindows().forEach((win) => {
                win.webContents.send("apply-theme");
              });
            }, 200);
          }
        });
        console.log(`[main] Watching ${name} for changes: ${dir}`);
      } catch (e) {
        console.warn(`[main] Failed to watch ${name}:`, e.message);
      }
    };

    const BUILTIN_THEMES_DIR = path.join(__dirname, "assets", "themes");
    const USER_THEMES_DIR = path.join(app.getPath("userData"), "themes");
    
    // Only watch builtin themes in development
    if (!app.isPackaged) {
      watchThemes(BUILTIN_THEMES_DIR, "builtin themes");
    }
    watchThemes(USER_THEMES_DIR, "user themes");

    ipcMain.on("win-minimize", (event) => {
      const win = BrowserWindow.fromWebContents(event.sender);
      if (win) win.minimize();
    });

    ipcMain.on("win-maximize", (event) => {
      const win = BrowserWindow.fromWebContents(event.sender);
      if (win) {
        win.isMaximized() ? win.unmaximize() : win.maximize();
      }
    });

    ipcMain.on("win-close", (event) => {
      const win = BrowserWindow.fromWebContents(event.sender);
      if (win) win.close();
    });

    // Region Selection Handlers
    ipcMain.on("start-region-selection", () => {
      createSelectionWindow();
    });

    ipcMain.on("finish-region-selection", (event, rect) => {
      const win = BrowserWindow.fromWebContents(event.sender);
      if (win) win.close();
      
      if (selectionResolve) {
        selectionResolve(rect);
        selectionResolve = null;
      } else {
        const mainWin = getWindow();
        if (mainWin) mainWin.webContents.send("region-selection-complete", rect);
      }
    });

    ipcMain.on("cancel-region-selection", (event) => {
      const win = BrowserWindow.fromWebContents(event.sender);
      if (win) win.close();
      if (selectionResolve) {
        selectionResolve(null);
        selectionResolve = null;
      }
    });
  });

  app.on("window-all-closed", () => {
    if (process.platform !== "darwin") app.quit();
  });

  app.on("activate", () => {
    if (getWindow() === null) createWindow();
  });
}
