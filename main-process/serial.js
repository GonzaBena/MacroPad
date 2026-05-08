const { ipcMain } = require("electron");
const { getWindow } = require("./window");

let activePort = null;
let reconnectTimer = null;
let reconnectAttempts = 0;
let lastPortPath = null;
let lastBaudRate = 9600;

const MAX_RECONNECT_ATTEMPTS = 10;
const RECONNECT_DELAYS = [3000, 6000, 12000, 20000, 30000]; // exponential backoff

function getReconnectDelay(attempts = reconnectAttempts) {
  const idx = Math.min(attempts, RECONNECT_DELAYS.length - 1);
  return RECONNECT_DELAYS[idx];
}

function clearReconnect() {
  if (reconnectTimer) {
    clearTimeout(reconnectTimer);
    reconnectTimer = null;
  }
  reconnectAttempts = 0;
}

function scheduleReconnect() {
  if (!lastPortPath || reconnectAttempts >= MAX_RECONNECT_ATTEMPTS) {
    const win = getWindow();
    if (win && reconnectAttempts >= MAX_RECONNECT_ATTEMPTS) {
      win.webContents.send(
        "serial-error",
        "Reconexión: máximo de intentos alcanzado",
      );
      win.webContents.send("serial-status", {
        connected: false,
        reconnecting: false,
      });
    }
    return;
  }

  const delay = getReconnectDelay();
  reconnectAttempts++;

  const win = getWindow();
  if (win) {
    win.webContents.send("serial-status", {
      connected: false,
      reconnecting: true,
      attempt: reconnectAttempts,
      maxAttempts: MAX_RECONNECT_ATTEMPTS,
    });
  }

  console.log(
    `[serial] Reconnecting in ${delay / 1000}s (attempt ${reconnectAttempts}/${MAX_RECONNECT_ATTEMPTS})`,
  );

  reconnectTimer = setTimeout(() => {
    connectSerial(lastPortPath, lastBaudRate, true);
  }, delay);
}

function setupSerial() {
  ipcMain.handle("list-ports", async () => {
    try {
      const { SerialPort } = require("serialport");
      const { ReadlineParser } = require("@serialport/parser-readline");
      const allPorts = await SerialPort.list();
      console.log(
        "[serial] Puertos detectados:",
        allPorts.map((p) => p.path),
      );

      // Agregar el estado de conexión si ya estamos conectados
      allPorts.forEach((p) => {
        if (activePort && activePort.isOpen && activePort.path === p.path) {
          p.signature = "Conectado";
        }
      });

      return allPorts;
    } catch (error) {
      console.error("Failed to list serial ports:", error);
      return [];
    }
  });

  ipcMain.on("connect-serial", (_, { port, baud }) => {
    clearReconnect(); // Cancel any pending reconnect
    connectSerial(port, baud, false);
  });

  ipcMain.on("disconnect-serial", () => {
    clearReconnect(); // Stop auto-reconnect on manual disconnect
    lastPortPath = null; // Prevent auto-reconnect
    if (activePort?.isOpen) {
      activePort.close(() => {
        const win = getWindow();
        if (win)
          win.webContents.send("serial-status", {
            connected: false,
            reconnecting: false,
          });
      });
    }
  });

  ipcMain.on("send-serial", (_, data) => {
    if (activePort?.isOpen) activePort.write(data + "\n");
  });

  ipcMain.on("cancel-reconnect", () => {
    clearReconnect();
    lastPortPath = null;
    const win = getWindow();
    if (win)
      win.webContents.send("serial-status", {
        connected: false,
        reconnecting: false,
      });
  });
}

function connectSerial(portPath, baudRate = 9600, isReconnect = false) {
  const win = getWindow();
  if (activePort?.isOpen) {
    try {
      activePort.close();
    } catch (_) {}
  }

  let SerialPort, ReadlineParser;
  try {
    ({ SerialPort } = require("serialport"));
    ({ ReadlineParser } = require("@serialport/parser-readline"));
  } catch (e) {
    if (win) {
      win.webContents.send(
        "serial-error",
        "serialport no disponible — corré: npx electron-rebuild",
      );
    }
    return;
  }

  try {
    activePort = new SerialPort({
      path: portPath,
      baudRate: parseInt(baudRate),
    });

    const parser = activePort.pipe(new ReadlineParser({ delimiter: "\n" }));

    activePort.on("open", () => {
      // Save for auto-reconnect
      lastPortPath = portPath;
      lastBaudRate = baudRate;
      clearReconnect(); // Reset reconnect state on successful connect

      if (win) {
        win.webContents.send("serial-status", {
          connected: true,
          reconnecting: false,
          port: portPath,
          baud: baudRate,
        });
      }
      if (isReconnect) {
        console.log(`[serial] Reconnected to ${portPath}`);
      }
    });

    parser.on("data", (line) => {
      const signal = line.trim();
      console.log("[serial] Received:", signal);
      if (!signal) return;
      if (win) {
        win.webContents.send("serial-data", { signal, ts: Date.now() });
        // We will need to trigger execution here.
        // We'll import the execution module later or emit an event.
        const { executeSequence } = require("./execution");
        executeSequence(signal);
      }
    });

    activePort.on("error", (err) => {
      if (win) {
        win.webContents.send("serial-error", err.message);
      }
      // Try to reconnect on error
      if (lastPortPath) {
        scheduleReconnect();
      }
    });

    activePort.on("close", () => {
      if (win) {
        win.webContents.send("serial-status", { connected: false });
      }
      // Auto-reconnect if we had a connection and didn't manually disconnect
      if (lastPortPath) {
        scheduleReconnect();
      }
    });
  } catch (err) {
    if (win) win.webContents.send("serial-error", err.message);
    // Retry on connection failure
    if (isReconnect && lastPortPath) {
      scheduleReconnect();
    }
  }
}

function getActivePort() {
  return activePort;
}

module.exports = {
  setupSerial,
  getActivePort,
  getReconnectDelay,
};
