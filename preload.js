const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("arduino", {
  listPorts: () => ipcRenderer.invoke("list-ports"),
  connect: (port, baud) => ipcRenderer.send("connect-serial", { port, baud }),
  disconnect: () => ipcRenderer.send("disconnect-serial"),
  send: (data) => ipcRenderer.send("send-serial", data),
  updateSignals: (map) => ipcRenderer.send("update-signal-map", map),
  testSequence: (signal) => ipcRenderer.send("test-sequence", signal),
  selectFile: () => ipcRenderer.invoke("select-file"),

  startKeyCapture: () => ipcRenderer.send("start-key-capture"),
  stopKeyCapture: () => ipcRenderer.send("stop-key-capture"),
  onKeyCaptured: (cb) =>
    ipcRenderer.on("key-captured", (_, combo) => cb(combo)),

  onStatus: (cb) => ipcRenderer.on("serial-status", (_, d) => cb(d)),
  onData: (cb) => ipcRenderer.on("serial-data", (_, d) => cb(d)),
  onError: (cb) => ipcRenderer.on("serial-error", (_, d) => cb(d)),
  onActionResult: (cb) => ipcRenderer.on("action-result", (_, d) => cb(d)),
  onNotification: (cb) => ipcRenderer.on("show-notification", (_, d) => cb(d)),
  onSequenceStart: (cb) => ipcRenderer.on("sequence-start", (_, d) => cb(d)),
  onSequenceEnd: (cb) => ipcRenderer.on("sequence-end", (_, d) => cb(d)),

  minimize: () => ipcRenderer.send("win-minimize"),
  maximize: () => ipcRenderer.send("win-maximize"),
  close: () => ipcRenderer.send("win-close"),
});
