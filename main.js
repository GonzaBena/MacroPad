const { app, ipcMain, dialog, BrowserWindow } = require("electron");
const {
  createWindow,
  getWindow,
  createConfigWindow,
  createAboutWindow,
  createThemePreviewWindow,
} = require("./main-process/window");
const { setupSerial } = require("./main-process/serial");
const { setupMedia } = require("./main-process/media");
const { setupKeyboard } = require("./main-process/keyboard");
const { setupExecution } = require("./main-process/execution");
const { setupPersistence } = require("./main-process/persistence");
const { setupTray } = require("./main-process/tray");
const { getThemeList, getThemeData, openThemesFolder } = require("./main-process/themes");
const { setupUpdater } = require("./main-process/updater");
const path = require("path");

// Forzar el nombre correcto en notificaciones de Windows
app.setAppUserModelId("PokePad"); // ← el string que quieras que aparezca

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
    // Si alguien intenta ejecutar una segunda instancia, enfocamos la ventana principal.
    const win = getWindow();
    if (win) {
      if (win.isMinimized()) win.restore();
      win.show();
      win.focus();
    }
  });

  // Flag para detectar cierre intencional de la app (ej: desde el tray)
  app.on("before-quit", () => {
    app.isQuiting = true;
  });

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

    // Configuración de módulos e IPCs
    setupSerial();
    setupMedia();
    setupKeyboard();
    setupExecution();
    setupPersistence();

    // Handlers IPC generales (Diálogos y Ventana)
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

    // Theme Handlers
    ipcMain.handle("get-themes", () => getThemeList());
    ipcMain.handle("get-theme-data", (event, themeId) => getThemeData(themeId));
    ipcMain.on("open-themes-folder", () => openThemesFolder());

    ipcMain.on("theme-changed", () => {
      BrowserWindow.getAllWindows().forEach((win) => {
        win.webContents.send("apply-theme");
      });
    });

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
  });

  app.on("window-all-closed", () => {
    if (process.platform !== "darwin") app.quit();
  });

  app.on("activate", () => {
    if (getWindow() === null) createWindow();
  });
}
