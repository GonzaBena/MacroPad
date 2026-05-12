"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.setupUpdater = setupUpdater;
const electron_updater_1 = require("electron-updater");
const electron_1 = require("electron");
function setupUpdater(mainWindow) {
    // Configuración básica
    electron_updater_1.autoUpdater.autoDownload = true;
    electron_updater_1.autoUpdater.autoInstallOnAppQuit = true;
    // Enviar mensajes a la ventana principal
    const sendStatusToWindow = (text, type = "info") => {
        mainWindow.webContents.send("update-message", { text, type });
    };
    electron_updater_1.autoUpdater.on("checking-for-update", () => {
        sendStatusToWindow("Buscando actualizaciones...", "info");
    });
    electron_updater_1.autoUpdater.on("update-available", (info) => {
        sendStatusToWindow(`Nueva versión encontrada: ${info.version}. Descargando...`, "success");
    });
    electron_updater_1.autoUpdater.on("update-not-available", (_info) => {
        sendStatusToWindow("Ya tienes la última versión instalada.", "info");
    });
    electron_updater_1.autoUpdater.on("error", (err) => {
        sendStatusToWindow(`Error en la actualización: ${err.message}`, "error");
    });
    electron_updater_1.autoUpdater.on("download-progress", (progressObj) => {
        let log_message = "Descargando: " + Math.round(progressObj.percent) + "%";
        sendStatusToWindow(log_message, "info");
    });
    electron_updater_1.autoUpdater.on("update-downloaded", (_info) => {
        sendStatusToWindow("Actualización descargada. Se instalará al cerrar la app.", "success");
    });
    // Handler para el botón manual
    electron_1.ipcMain.on("check-for-updates", () => {
        electron_updater_1.autoUpdater.checkForUpdatesAndNotify();
    });
}
