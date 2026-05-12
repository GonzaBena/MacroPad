import { contextBridge, ipcRenderer, webFrame } from "electron";
import { SignalMap, GlobalVariables } from "./src/types/pokepad";

/**
 * Helper: register a one-way listener with auto-cleanup.
 * Prevents memory leaks on hot reload by removing previous listeners.
 */
function safeOn(channel: string, cb: (data: any) => void) {
  ipcRenderer.removeAllListeners(channel);
  ipcRenderer.on(channel, (_, d) => cb(d));
}

contextBridge.exposeInMainWorld("arduino", {
  // Native Zoom
  setZoomFactor: (factor: number) => webFrame.setZoomFactor(factor),

  // Serial
  listPorts: () => ipcRenderer.invoke("list-ports"),
  getConnectionStatus: () => ipcRenderer.invoke("get-connection-status"),
  connect: (port: string, baud: number) => ipcRenderer.send("connect-serial", { port, baud }),
  disconnect: () => ipcRenderer.send("disconnect-serial"),
  send: (data: string) => ipcRenderer.send("send-serial", data),
  updateSignals: (map: SignalMap) => ipcRenderer.send("update-signal-map", map),
  updateGlobalVars: (vars: GlobalVariables) => ipcRenderer.send("update-global-vars", vars),
  testSequence: (signal: string) => ipcRenderer.send("test-sequence", signal),
  selectFile: () => ipcRenderer.invoke("select-file"),
  fileExists: (path: string) => ipcRenderer.invoke("file-exists", path),

  // Key capture
  startKeyCapture: () => ipcRenderer.send("start-key-capture"),
  stopKeyCapture: () => ipcRenderer.send("stop-key-capture"),
  onKeyCaptured: (cb: (combo: string) => void) => safeOn("key-captured", cb),

  // Event listeners (with auto-cleanup)
  onStatus: (cb: (data: any) => void) => safeOn("serial-status", cb),
  onData: (cb: (data: any) => void) => safeOn("serial-data", cb),
  onError: (cb: (message: string) => void) => safeOn("serial-error", cb),
  onActionResult: (cb: (data: any) => void) => safeOn("action-result", cb),
  onNotification: (cb: (data: any) => void) => safeOn("show-notification", cb),
  onSequenceStart: (cb: (signal: string) => void) => safeOn("sequence-start", cb),
  onSequenceEnd: (cb: (data: any) => void) => safeOn("sequence-end", cb),

  // Window controls
  minimize: () => ipcRenderer.send("win-minimize"),
  maximize: () => ipcRenderer.send("win-maximize"),
  close: () => ipcRenderer.send("win-close"),
  openConfigWindow: () => ipcRenderer.send("open-config-window"),
  openAboutWindow: () => ipcRenderer.send("open-about-window"),
  openThemePreview: () => ipcRenderer.send("open-theme-preview"),
  getAppVersion: () => ipcRenderer.invoke("get-app-version"),
  listRunningApps: () => ipcRenderer.invoke("list-running-apps"),
  listInstalledApps: () => ipcRenderer.invoke("list-installed-apps"),
  checkForUpdates: () => ipcRenderer.send("check-for-updates"),
  onUpdateMessage: (cb: (data: any) => void) => safeOn("update-message", cb),

  // Persistence (file-based)
  loadData: () => ipcRenderer.invoke("load-data"),
  saveData: (data: any) => ipcRenderer.invoke("save-data", data),
  exportData: () => ipcRenderer.invoke("export-data"),
  importData: () => ipcRenderer.invoke("import-data"),
  exportSingleWorkflow: (name: string, data: any) => ipcRenderer.invoke("export-single-workflow", { name, data }),
  importSingleWorkflow: () => ipcRenderer.invoke("import-single-workflow"),
  exportFolder: (folderName: string, workflows: any[]) => ipcRenderer.invoke("export-folder", { folderName, workflows }),
  importFolder: () => ipcRenderer.invoke("import-folder"),

  // Themes
  getThemes: () => ipcRenderer.invoke("get-themes"),
  getThemeData: (id: string) => ipcRenderer.invoke("get-theme-data", id),
  openThemesFolder: () => ipcRenderer.send("open-themes-folder"),
  importExternalTheme: () => ipcRenderer.invoke("import-external-theme"),
  notifyThemeChanged: () => ipcRenderer.send("theme-changed"),
  onApplyTheme: (cb: () => void) => safeOn("apply-theme", cb),

  // Region Selection
  startRegionSelection: () => ipcRenderer.send("start-region-selection"),
  onRegionSelected: (cb: (rect: any) => void) => safeOn("region-selection-complete", cb),
});

contextBridge.exposeInMainWorld("selectionApi", {
  finishSelection: (rect: any) => ipcRenderer.send("finish-region-selection", rect),
  cancelSelection: () => ipcRenderer.send("cancel-region-selection"),
});
