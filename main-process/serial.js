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
      win.webContents.send("serial-error", "Reconexión: máximo de intentos alcanzado");
      win.webContents.send("serial-status", { connected: false, reconnecting: false });
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

  console.log(`[serial] Reconnecting in ${delay / 1000}s (attempt ${reconnectAttempts}/${MAX_RECONNECT_ATTEMPTS})`);

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

      const validPorts = [];
      const testPromises = allPorts.map(async (portInfo) => {
        // Si el puerto ya está conectado, lo incluimos directamente
        if (activePort && activePort.isOpen && activePort.path === portInfo.path) {
          portInfo.signature = "Conectado";
          validPorts.push(portInfo);
          return;
        }

        return new Promise((resolve) => {
          let resolved = false;
          let testPort;

          const finish = () => {
            if (!resolved) {
              resolved = true;
              if (testPort && testPort.isOpen) testPort.close();
              resolve();
            }
          };

          const timeout = setTimeout(finish, 2500); // 2.5s máximo por puerto

          try {
            testPort = new SerialPort({ path: portInfo.path, baudRate: 9600 });
            const parser = testPort.pipe(new ReadlineParser({ delimiter: "\n" }));

            testPort.on("open", () => {
              // Esperamos 1.5s para que el Arduino termine de reiniciar
              setTimeout(() => {
                if (!resolved && testPort.isOpen) {
                  testPort.write("IDENTIFY\n");
                }
              }, 1500);
            });

            parser.on("data", (line) => {
              const signal = line.trim();
              if (signal && !resolved) {
                portInfo.signature = signal; // Guardamos la firma
                validPorts.push(portInfo);
                finish();
              }
            });

            testPort.on("error", finish);
          } catch (err) {
            finish();
          }
        });
      });

      await Promise.all(testPromises);
      return validPorts;

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
        if (win) win.webContents.send("serial-status", { connected: false, reconnecting: false });
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
    if (win) win.webContents.send("serial-status", { connected: false, reconnecting: false });
  });
}

function connectSerial(portPath, baudRate = 9600, isReconnect = false) {
  const win = getWindow();
  if (activePort?.isOpen) {
    try { activePort.close(); } catch (_) {}
  }

  let SerialPort, ReadlineParser;
  try {
    ({ SerialPort } = require("serialport"));
    ({ ReadlineParser } = require("@serialport/parser-readline"));
  } catch (e) {
    if (win) {
      win.webContents.send(
        "serial-error",
        "serialport no disponible — corré: npx electron-rebuild"
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
