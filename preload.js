const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("arduino", {
  listPorts: () => ipcRenderer.invoke("list-ports"),
  connect: (port, baud) => ipcRenderer.send("connect-serial", { port, baud }),
  disconnect: () => ipcRenderer.send("disconnect-serial"),
  send: (data) => ipcRenderer.send("send-serial", data),
  updateActions: (map) => ipcRenderer.send("update-action-map", map),

  onStatus: (cb) => ipcRenderer.on("serial-status", (_, d) => cb(d)),
  onData: (cb) => ipcRenderer.on("serial-data", (_, d) => cb(d)),
  onError: (cb) => ipcRenderer.on("serial-error", (_, d) => cb(d)),
  onActionResult: (cb) => ipcRenderer.on("action-result", (_, d) => cb(d)),
  onNotification: (cb) => ipcRenderer.on("show-notification", (_, d) => cb(d)),

  minimize: () => ipcRenderer.send("win-minimize"),
  maximize: () => ipcRenderer.send("win-maximize"),
  close: () => ipcRenderer.send("win-close"),
});
