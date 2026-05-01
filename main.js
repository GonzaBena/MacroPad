const { app, ipcMain, dialog } = require("electron");
const { createWindow, getWindow } = require("./main-process/window");
const { setupSerial } = require("./main-process/serial");
const { setupMedia } = require("./main-process/media");
const { setupKeyboard } = require("./main-process/keyboard");
const { setupExecution } = require("./main-process/execution");
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

// Inicialización de la App
app.whenReady().then(() => {
  const win = createWindow();

  // Configuración de módulos e IPCs
  setupSerial();
  setupMedia();
  setupKeyboard();
  setupExecution();

  // Handlers IPC generales (Diálogos y Ventana)
  ipcMain.handle("select-file", async () => {
    const win = getWindow();
    const { canceled, filePaths } = await dialog.showOpenDialog(win, {
      properties: ["openFile", "openDirectory"],
    });
    if (canceled) return null;
    return filePaths[0];
  });

  ipcMain.on("win-minimize", () => getWindow()?.minimize());
  ipcMain.on("win-maximize", () => {
    const win = getWindow();
    if (win) win.isMaximized() ? win.unmaximize() : win.maximize();
  });
  ipcMain.on("win-close", () => getWindow()?.close());
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

app.on("activate", () => {
  if (getWindow() === null) createWindow();
});
