const { ipcMain } = require("electron");
const { getWindow } = require("./window");

const FIRMA = "POKEPAD_V1";
const HANDSHAKE = "IDENTIFY";
const AUTO_CONNECT_INTERVAL = 3000;

// Common VID/PIDs for Arduino Nano (CH340 and FTDI)
const ARDUINO_IDS = [
  { vid: "1a86", pid: "7523" }, // CH340 (Common in clones)
  { vid: "0403", pid: "6001" }, // FTDI (Original/High quality)
];

function isPotentialDevice(port) {
  const vid = (port.vendorId || "").toLowerCase().replace("0x", "");
  const pid = (port.productId || "").toLowerCase().replace("0x", "");
  const manufacturer = (port.manufacturer || "").toLowerCase();
  const pnpId = (port.pnpId || "").toLowerCase();
  const friendlyName = (port.friendlyName || "").toLowerCase();

  console.log(`[serial] Revisando puerto: ${port.path} | VID:${vid} | PID:${pid} | Mfr:${manufacturer}`);

  // 1. Check exact IDs
  if (ARDUINO_IDS.some(id => id.vid === vid && id.pid === pid)) return true;
  
  // 2. Check manufacturer strings
  if (manufacturer.includes("wch") || 
      manufacturer.includes("ftdi") || 
      manufacturer.includes("arduino") ||
      manufacturer.includes("usb-serial")) return true;

  // 3. Check PnP or Friendly Name
  if (pnpId.includes("1a86") || pnpId.includes("0403") ||
      friendlyName.includes("arduino") || 
      friendlyName.includes("ch340") ||
      port.path.toLowerCase().includes("usbserial")) return true;

  return false;
}

let activePort = null;
let reconnectTimer = null;
let reconnectAttempts = 0;
let lastPortPath = null;
let lastBaudRate = 9600;
let autoConnectTimer = null;

// Cache to store verification results: { path: { isOurDevice: boolean, lastChecked: number } }
const verifiedPorts = new Map();

function clearReconnect() {
  if (reconnectTimer) {
    clearTimeout(reconnectTimer);
    reconnectTimer = null;
  }
  reconnectAttempts = 0;
}

async function verifyPort(portPath, baudRate = 9600) {
  if (verifiedPorts.has(portPath) && verifiedPorts.get(portPath).isOurDevice) {
    return true;
  }

  const { SerialPort } = require("serialport");
  const { ReadlineParser } = require("@serialport/parser-readline");

  return new Promise((resolve) => {
    let port = null;
    let timeout = null;

    const cleanup = () => {
      if (timeout) clearTimeout(timeout);
      if (port && port.isOpen) port.close();
    };

    try {
      // Use 'cu' instead of 'tty' on macOS if possible for better reliability
      const targetPath = portPath.replace("/dev/tty.", "/dev/cu.");
      
      console.log(`[serial] Verificando firma en ${targetPath}...`);
      port = new SerialPort({ 
        path: targetPath, 
        baudRate: parseInt(baudRate),
        lock: false 
      });
      const parser = port.pipe(new ReadlineParser({ delimiter: "\n" }));

      timeout = setTimeout(() => {
        console.log(`[serial] Timeout de firma en ${targetPath}`);
        verifiedPorts.set(portPath, { isOurDevice: false, lastChecked: Date.now() });
        cleanup();
        resolve(false);
      }, 4500);

      port.on("open", () => {
        // Wait for bootloader -> clear buffer -> wait -> send identify
        setTimeout(() => {
          if (port.isOpen) {
            port.write("\n\n"); // Clear garbage
            setTimeout(() => {
              if (port.isOpen) {
                console.log(`[serial] Enviando ${HANDSHAKE} a ${targetPath}`);
                port.write(HANDSHAKE + "\n");
              }
            }, 500);
          }
        }, 1500);
      });

      parser.on("data", (line) => {
        const response = line.trim();
        console.log(`[serial] Respuesta de ${targetPath}: "${response}"`);
        if (response === FIRMA) {
          console.log(`[serial] ¡Dispositivo verificado!`);
          verifiedPorts.set(portPath, { isOurDevice: true, lastChecked: Date.now() });
          cleanup();
          resolve(true);
        }
      });

      port.on("error", (err) => {
        console.log(`[serial] Error en ${targetPath}: ${err.message}`);
        cleanup();
        resolve(false);
      });
    } catch (e) {
      console.log(`[serial] Excepción en ${portPath}: ${e.message}`);
      resolve(false);
    }
  });
}

function startAutoConnect() {
  if (autoConnectTimer) return;
  
  autoConnectTimer = setInterval(async () => {
    if (activePort && activePort.isOpen) return;

    try {
      const { SerialPort } = require("serialport");
      const allPorts = await SerialPort.list();
      
      const candidates = allPorts.filter(p => isPotentialDevice(p));
      if (candidates.length === 0) return;

      const results = await Promise.all(candidates.map(async p => ({
        port: p,
        isOurs: await verifyPort(p.path)
      })));

      const found = results.find(r => r.isOurs);
      if (found && (!activePort || !activePort.isOpen)) {
        console.log(`[serial] Auto-conectando a: ${found.port.path}`);
        connectSerial(found.port.path, lastBaudRate);
      }
    } catch (err) {
      console.error("[serial] Auto-connect scan failed:", err);
    }
  }, AUTO_CONNECT_INTERVAL);
}

function setupSerial() {
  ipcMain.handle("list-ports", async () => {
    try {
      const { SerialPort } = require("serialport");
      const allPorts = await SerialPort.list();
      
      const candidates = allPorts.filter(p => 
        isPotentialDevice(p) || (activePort && activePort.path === p.path)
      );

      const verificationResults = await Promise.all(
        candidates.map(async (p) => {
          const isCurrentlyConnected = activePort && activePort.isOpen && activePort.path === p.path;
          const isVerified = isCurrentlyConnected || await verifyPort(p.path);
          return { port: p, isVerified };
        })
      );

      return verificationResults
        .filter(r => r.isVerified)
        .map(r => {
          const p = r.port;
          if (activePort && activePort.isOpen && activePort.path === p.path) {
            p.signature = "Conectado";
          } else {
            p.signature = FIRMA;
          }
          return p;
        });
    } catch (error) {
      console.error("Failed to list serial ports:", error);
      return [];
    }
  });

  ipcMain.on("connect-serial", (_, { port, baud }) => {
    clearReconnect();
    connectSerial(port, baud, false);
  });

  ipcMain.on("disconnect-serial", () => {
    clearReconnect();
    lastPortPath = null;
    if (activePort?.isOpen) {
      activePort.close();
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

  // Start the background scanner
  startAutoConnect();
}

function connectSerial(portPath, baudRate = 9600, isReconnect = false) {
  const win = getWindow();
  if (activePort?.isOpen) {
    if (activePort.path === portPath) return; // Already connected
    try {
      activePort.close();
    } catch (_) {}
  }

  let SerialPort, ReadlineParser;
  try {
    ({ SerialPort } = require("serialport"));
    ({ ReadlineParser } = require("@serialport/parser-readline"));
  } catch (e) {
    if (win) win.webContents.send("serial-error", "serialport no disponible");
    return;
  }

  try {
    activePort = new SerialPort({
      path: portPath,
      baudRate: parseInt(baudRate),
    });

    const parser = activePort.pipe(new ReadlineParser({ delimiter: "\n" }));

    activePort.on("open", () => {
      lastPortPath = portPath;
      lastBaudRate = baudRate;
      clearReconnect();

      if (win) {
        win.webContents.send("serial-status", {
          connected: true,
          reconnecting: false,
          port: portPath,
          baud: baudRate,
        });
      }
    });

    parser.on("data", (line) => {
      const signal = line.trim();
      if (!signal) return;
      if (win) {
        win.webContents.send("serial-data", { signal, ts: Date.now() });
        const { executeSequence } = require("./execution");
        executeSequence(signal);
      }
    });

    activePort.on("error", (err) => {
      if (win) win.webContents.send("serial-error", err.message);
    });

    activePort.on("close", () => {
      if (win) win.webContents.send("serial-status", { connected: false });
    });
  } catch (err) {
    if (win) win.webContents.send("serial-error", err.message);
  }
}

function getActivePort() {
  return activePort;
}

module.exports = {
  setupSerial,
  getActivePort,
};
