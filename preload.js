const { contextBridge, ipcRenderer, webFrame } = require("electron");

/**
 * Helper: register a one-way listener with auto-cleanup.
 * Prevents memory leaks on hot reload by removing previous listeners.
 */
function safeOn(channel, cb) {
  ipcRenderer.removeAllListeners(channel);
  ipcRenderer.on(channel, (_, d) => cb(d));
}

contextBridge.exposeInMainWorld("arduino", {
  // Native Zoom
  setZoomFactor: (factor) => webFrame.setZoomFactor(factor),

  // Serial
  listPorts: () => ipcRenderer.invoke("list-ports"),
  getConnectionStatus: () => ipcRenderer.invoke("get-connection-status"),
  connect: (port, baud) => ipcRenderer.send("connect-serial", { port, baud }),
  disconnect: () => ipcRenderer.send("disconnect-serial"),
  send: (data) => ipcRenderer.send("send-serial", data),
  updateSignals: (map) => ipcRenderer.send("update-signal-map", map),
  testSequence: (signal) => ipcRenderer.send("test-sequence", signal),
  selectFile: () => ipcRenderer.invoke("select-file"),

  // Key capture
  startKeyCapture: () => ipcRenderer.send("start-key-capture"),
  stopKeyCapture: () => ipcRenderer.send("stop-key-capture"),
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
  minimize: () => ipcRenderer.send("win-minimize"),
  maximize: () => ipcRenderer.send("win-maximize"),
  close: () => ipcRenderer.send("win-close"),
  openConfigWindow: () => ipcRenderer.send("open-config-window"),
  openAboutWindow: () => ipcRenderer.send("open-about-window"),
  openThemePreview: () => ipcRenderer.send("open-theme-preview"),
  getAppVersion: () => ipcRenderer.invoke("get-app-version"),
  checkForUpdates: () => ipcRenderer.send("check-for-updates"),
  onUpdateMessage: (cb) => safeOn("update-message", cb),

  // Persistence (file-based)
  loadData: () => ipcRenderer.invoke("load-data"),
  saveData: (data) => ipcRenderer.invoke("save-data", data),
  exportData: () => ipcRenderer.invoke("export-data"),
  importData: () => ipcRenderer.invoke("import-data"),
  exportSingleWorkflow: (name, data) => ipcRenderer.invoke("export-single-workflow", { name, data }),
  importSingleWorkflow: () => ipcRenderer.invoke("import-single-workflow"),

  // Themes
  getThemes: () => ipcRenderer.invoke("get-themes"),
  getThemeData: (id) => ipcRenderer.invoke("get-theme-data", id),
  openThemesFolder: () => ipcRenderer.send("open-themes-folder"),
  notifyThemeChanged: () => ipcRenderer.send("theme-changed"),
  onApplyTheme: (cb) => safeOn("apply-theme", cb),

  // Region Selection
  startRegionSelection: () => ipcRenderer.send("start-region-selection"),
  onRegionSelected: (cb) => safeOn("region-selection-complete", cb),
});

contextBridge.exposeInMainWorld("selectionApi", {
  finishSelection: (rect) => ipcRenderer.send("finish-region-selection", rect),
  cancelSelection: () => ipcRenderer.send("cancel-region-selection"),
});
