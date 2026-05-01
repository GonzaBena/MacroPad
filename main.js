const { app, ipcMain, dialog, BrowserWindow } = require("electron");
const { createWindow, getWindow, createConfigWindow, createAboutWindow } = require("./main-process/window");
const { setupSerial } = require("./main-process/serial");
const { setupMedia } = require("./main-process/media");
const { setupKeyboard } = require("./main-process/keyboard");
const { setupExecution } = require("./main-process/execution");
const { setupPersistence } = require("./main-process/persistence");
const path = require("path");

// Habilitar hot reload en desarrollo
if (!app.isPackaged) {
  try {
    require("electron-reload")(__dirname, {
      electron: path.join(__dirname, "node_modules", ".bin", "electron")
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
      win.focus();
    }
  });

  // Inicialización de la App
  app.whenReady().then(() => {
    createWindow();

  // Configuración de módulos e IPCs
  setupSerial();
  setupMedia();
  setupKeyboard();
  setupExecution();
  setupPersistence();

  // Handlers IPC generales (Diálogos y Ventana)
  ipcMain.handle("select-file", async () => {
    const win = getWindow();
    const { canceled, filePaths } = await dialog.showOpenDialog(win, {
      properties: ["openFile", "openDirectory"],
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

  ipcMain.handle("get-app-version", () => {
    return app.getVersion();
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
