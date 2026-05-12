import { autoUpdater } from "electron-updater";
import { ipcMain, BrowserWindow } from "electron";

export function setupUpdater(mainWindow: BrowserWindow) {
  // Configuración básica
  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;

  // Enviar mensajes a la ventana principal
  const sendStatusToWindow = (text: string, type: 'info' | 'error' | 'success' = "info") => {
    mainWindow.webContents.send("update-message", { text, type });
  };

  autoUpdater.on("checking-for-update", () => {
    sendStatusToWindow("Buscando actualizaciones...", "info");
  });

  autoUpdater.on("update-available", (info) => {
    sendStatusToWindow(`Nueva versión encontrada: ${info.version}. Descargando...`, "success");
  });

  autoUpdater.on("update-not-available", (_info) => {
    sendStatusToWindow("Ya tienes la última versión instalada.", "info");
  });

  autoUpdater.on("error", (err) => {
    sendStatusToWindow(`Error en la actualización: ${err.message}`, "error");
  });

  autoUpdater.on("download-progress", (progressObj) => {
    let log_message = "Descargando: " + Math.round(progressObj.percent) + "%";
    sendStatusToWindow(log_message, "info");
  });

  autoUpdater.on("update-downloaded", (_info) => {
    sendStatusToWindow("Actualización descargada. Se instalará al cerrar la app.", "success");
  });

  // Handler para el botón manual
  ipcMain.on("check-for-updates", () => {
    autoUpdater.checkForUpdatesAndNotify();
  });
}
