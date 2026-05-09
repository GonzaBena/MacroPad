const { autoUpdater } = require("electron-updater");
const { ipcMain } = require("electron");

function setupUpdater(mainWindow) {
  // Configuración básica
  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;

  // Enviar mensajes a la ventana principal
  const sendStatusToWindow = (text, type = "info") => {
    mainWindow.webContents.send("update-message", { text, type });
  };

  autoUpdater.on("checking-for-update", () => {
    sendStatusToWindow("Buscando actualizaciones...", "info");
  });

  autoUpdater.on("update-available", (info) => {
    sendStatusToWindow(`Nueva versión encontrada: ${info.version}. Descargando...`, "success");
  });

  autoUpdater.on("update-not-available", (info) => {
    sendStatusToWindow("Ya tienes la última versión instalada.", "info");
  });

  autoUpdater.on("error", (err) => {
    sendStatusToWindow(`Error en la actualización: ${err.message}`, "error");
  });

  autoUpdater.on("download-progress", (progressObj) => {
    let log_message = "Descargando: " + Math.round(progressObj.percent) + "%";
    sendStatusToWindow(log_message, "info");
  });

  autoUpdater.on("update-downloaded", (info) => {
    sendStatusToWindow("Actualización descargada. Se instalará al cerrar la app.", "success");
  });

  // Handler para el botón manual
  ipcMain.on("check-for-updates", () => {
    autoUpdater.checkForUpdatesAndNotify();
  });
}

module.exports = { setupUpdater };
