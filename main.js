const { app, BrowserWindow, ipcMain, shell } = require("electron");
const { exec } = require("child_process");
const path = require("path");

let win;
let activePort = null;
let actionMap = {};

// ── Ventana ──────────────────────────────────────────────────────────────────
function createWindow() {
  win = new BrowserWindow({
    width: 960,
    height: 680,
    minWidth: 720,
    minHeight: 500,
    frame: false,
    backgroundColor: "#0c0e14",
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  win.loadFile(path.join(__dirname, "renderer", "index.html"));
  // Abrí DevTools automáticamente en desarrollo para ver errores
  // win.webContents.openDevTools();
}

// ── Serial (require lazy para que un fallo no rompa todo) ─────────────────────
function connectSerial(portPath, baudRate = 9600) {
  if (activePort && activePort.isOpen) activePort.close();

  let SerialPort, ReadlineParser;
  try {
    ({ SerialPort } = require("serialport"));
    ({ ReadlineParser } = require("@serialport/parser-readline"));
  } catch (e) {
    win.webContents.send(
      "serial-error",
      "serialport no disponible: " +
        e.message +
        " — corré: npx electron-rebuild",
    );
    return;
  }

  try {
    activePort = new SerialPort({
      path: portPath,
      baudRate: parseInt(baudRate),
    });
    const parser = activePort.pipe(new ReadlineParser({ delimiter: "\n" }));

    activePort.on("open", () => {
      win.webContents.send("serial-status", {
        connected: true,
        port: portPath,
        baud: baudRate,
      });
    });

    parser.on("data", (line) => {
      const signal = line.trim();
      if (!signal) return;
      win.webContents.send("serial-data", { signal, ts: Date.now() });
      const action = actionMap[signal];
      if (action) executeAction(action, signal);
    });

    activePort.on("error", (err) => {
      win.webContents.send("serial-error", err.message);
      win.webContents.send("serial-status", { connected: false });
    });

    activePort.on("close", () => {
      win.webContents.send("serial-status", { connected: false });
    });
  } catch (err) {
    win.webContents.send("serial-error", err.message);
  }
}

function disconnectSerial() {
  if (activePort && activePort.isOpen) {
    activePort.close(() =>
      win.webContents.send("serial-status", { connected: false }),
    );
  }
}

// ── Acciones ──────────────────────────────────────────────────────────────────
function executeAction(action, signal) {
  switch (action.type) {
    case "open_url":
      if (action.value) shell.openExternal(action.value);
      break;
    case "run_command":
      if (action.value)
        exec(action.value, (err, stdout) => {
          win.webContents.send("action-result", {
            signal,
            ok: !err,
            output: err ? err.message : stdout,
          });
        });
      break;
    case "open_file":
    case "open_folder":
      if (action.value) shell.openPath(action.value);
      break;
    case "notification":
      win.webContents.send("show-notification", {
        title: `Señal: ${signal}`,
        body: action.value || "Acción disparada",
      });
      break;
  }
}

// ── IPC ───────────────────────────────────────────────────────────────────────
ipcMain.handle("list-ports", async () => {
  try {
    const { SerialPort } = require("serialport");
    const ports = await SerialPort.list();
    console.log("Puertos encontrados:", ports);
    return ports;
  } catch (e) {
    console.error("Error listando puertos:", e.message);
    return [];
  }
});

ipcMain.on("connect-serial", (_, { port, baud }) => connectSerial(port, baud));
ipcMain.on("disconnect-serial", () => disconnectSerial());
ipcMain.on("update-action-map", (_, map) => {
  actionMap = map;
});
ipcMain.on("send-serial", (_, data) => {
  if (activePort && activePort.isOpen) activePort.write(data + "\n");
});

ipcMain.on("win-minimize", () => win.minimize());
ipcMain.on("win-maximize", () =>
  win.isMaximized() ? win.unmaximize() : win.maximize(),
);
ipcMain.on("win-close", () => win.close());

// ── App ───────────────────────────────────────────────────────────────────────
app.whenReady().then(createWindow);
app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});
