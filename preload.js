"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const electron_1 = require("electron");
/**
 * Helper: register a one-way listener with auto-cleanup.
 * Prevents memory leaks on hot reload by removing previous listeners.
 */
function safeOn(channel, cb) {
    electron_1.ipcRenderer.removeAllListeners(channel);
    electron_1.ipcRenderer.on(channel, (_, d) => cb(d));
}
electron_1.contextBridge.exposeInMainWorld("arduino", {
    // Native Zoom
    setZoomFactor: (factor) => electron_1.webFrame.setZoomFactor(factor),
    // Serial
    listPorts: () => electron_1.ipcRenderer.invoke("list-ports"),
    getConnectionStatus: () => electron_1.ipcRenderer.invoke("get-connection-status"),
    connect: (port, baud) => electron_1.ipcRenderer.send("connect-serial", { port, baud }),
    disconnect: () => electron_1.ipcRenderer.send("disconnect-serial"),
    send: (data) => electron_1.ipcRenderer.send("send-serial", data),
    updateSignals: (map) => electron_1.ipcRenderer.send("update-signal-map", map),
    updateGlobalVars: (vars) => electron_1.ipcRenderer.send("update-global-vars", vars),
    testSequence: (signal) => electron_1.ipcRenderer.send("test-sequence", signal),
    selectFile: () => electron_1.ipcRenderer.invoke("select-file"),
    fileExists: (path) => electron_1.ipcRenderer.invoke("file-exists", path),
    // Key capture
    startKeyCapture: () => electron_1.ipcRenderer.send("start-key-capture"),
    stopKeyCapture: () => electron_1.ipcRenderer.send("stop-key-capture"),
    onKeyCaptured: (cb) => safeOn("key-captured", cb),
    // Event listeners (with auto-cleanup)
    onStatus: (cb) => safeOn("serial-status", cb),
    onData: (cb) => safeOn("serial-data", cb),
    onError: (cb) => safeOn("serial-error", cb),
    onActionResult: (cb) => safeOn("action-result", cb),
    onNotification: (cb) => safeOn("show-notification", cb),
    onSequenceStart: (cb) => safeOn("sequence-start", cb),
    onSequenceEnd: (cb) => safeOn("sequence-end", cb),
    // Window controls
    minimize: () => electron_1.ipcRenderer.send("win-minimize"),
    maximize: () => electron_1.ipcRenderer.send("win-maximize"),
    close: () => electron_1.ipcRenderer.send("win-close"),
    openConfigWindow: () => electron_1.ipcRenderer.send("open-config-window"),
    openAboutWindow: () => electron_1.ipcRenderer.send("open-about-window"),
    openThemePreview: () => electron_1.ipcRenderer.send("open-theme-preview"),
    getAppVersion: () => electron_1.ipcRenderer.invoke("get-app-version"),
    listRunningApps: () => electron_1.ipcRenderer.invoke("list-running-apps"),
    listInstalledApps: () => electron_1.ipcRenderer.invoke("list-installed-apps"),
    checkForUpdates: () => electron_1.ipcRenderer.send("check-for-updates"),
    onUpdateMessage: (cb) => safeOn("update-message", cb),
    // Persistence (file-based)
    loadData: () => electron_1.ipcRenderer.invoke("load-data"),
    saveData: (data) => electron_1.ipcRenderer.invoke("save-data", data),
    exportData: () => electron_1.ipcRenderer.invoke("export-data"),
    importData: () => electron_1.ipcRenderer.invoke("import-data"),
    exportSingleWorkflow: (name, data) => electron_1.ipcRenderer.invoke("export-single-workflow", { name, data }),
    importSingleWorkflow: () => electron_1.ipcRenderer.invoke("import-single-workflow"),
    exportFolder: (folderName, workflows) => electron_1.ipcRenderer.invoke("export-folder", { folderName, workflows }),
    importFolder: () => electron_1.ipcRenderer.invoke("import-folder"),
    // Themes
    getThemes: () => electron_1.ipcRenderer.invoke("get-themes"),
    getThemeData: (id) => electron_1.ipcRenderer.invoke("get-theme-data", id),
    openThemesFolder: () => electron_1.ipcRenderer.send("open-themes-folder"),
    importExternalTheme: () => electron_1.ipcRenderer.invoke("import-external-theme"),
    notifyThemeChanged: () => electron_1.ipcRenderer.send("theme-changed"),
    onApplyTheme: (cb) => safeOn("apply-theme", cb),
    // Region Selection
    startRegionSelection: () => electron_1.ipcRenderer.send("start-region-selection"),
    onRegionSelected: (cb) => safeOn("region-selection-complete", cb),
});
electron_1.contextBridge.exposeInMainWorld("selectionApi", {
    finishSelection: (rect) => electron_1.ipcRenderer.send("finish-region-selection", rect),
    cancelSelection: () => electron_1.ipcRenderer.send("cancel-region-selection"),
});
