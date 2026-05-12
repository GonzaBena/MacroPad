"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.isPotentialDevice = isPotentialDevice;
exports.verifyPort = verifyPort;
exports.setupSerial = setupSerial;
exports.getActivePort = getActivePort;
const electron_1 = require("electron");
// @ts-ignore
const window_1 = require("./window");
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
    if (ARDUINO_IDS.some(id => id.vid === vid && id.pid === pid))
        return true;
    // 2. Check manufacturer strings
    if (manufacturer.includes("wch") ||
        manufacturer.includes("ftdi") ||
        manufacturer.includes("arduino") ||
        manufacturer.includes("usb-serial"))
        return true;
    // 3. Check PnP or Friendly Name
    if (pnpId.includes("1a86") || pnpId.includes("0403") ||
        friendlyName.includes("arduino") ||
        friendlyName.includes("ch340") ||
        port.path.toLowerCase().includes("usbserial"))
        return true;
    return false;
}
let activePort = null;
let reconnectTimer = null;
let reconnectAttempts = 0;
let lastPortPath = null;
let lastBaudRate = 9600;
let autoConnectTimer = null;
// Cache to store verification results: { isOurDevice: boolean, lastChecked: number }
const verifiedPorts = new Map();
const currentlyVerifying = new Set();
// Ignorar re-intentos de puertos fallidos por 30 segundos
const NEGATIVE_CACHE_TTL = 30000;
function clearReconnect() {
    if (reconnectTimer) {
        clearTimeout(reconnectTimer);
        reconnectTimer = null;
    }
    reconnectAttempts = 0;
}
async function verifyPort(portPath, baudRate = 9600) {
    const now = Date.now();
    const cached = verifiedPorts.get(portPath);
    // Si ya es nuestro, OK
    if (cached?.isOurDevice)
        return true;
    // Si falló hace poco, ignorar para no resetear el Arduino constantemente
    if (cached && !cached.isOurDevice && (now - cached.lastChecked < NEGATIVE_CACHE_TTL)) {
        return false;
    }
    if (currentlyVerifying.has(portPath))
        return false;
    currentlyVerifying.add(portPath);
    const { SerialPort } = require("serialport");
    const { ReadlineParser } = require("@serialport/parser-readline");
    return new Promise((resolve) => {
        let port = null;
        let timeout = null;
        const cleanup = () => {
            currentlyVerifying.delete(portPath);
            if (timeout)
                clearTimeout(timeout);
            if (port && port.isOpen)
                port.close();
        };
        try {
            console.log(`[serial] Verificando: ${portPath}...`);
            port = new SerialPort({
                path: portPath,
                baudRate: typeof baudRate === "string" ? parseInt(baudRate) : baudRate,
                lock: false
            });
            const parser = port.pipe(new ReadlineParser({ delimiter: "\n" }));
            timeout = setTimeout(() => {
                console.log(`[serial] Timeout en ${portPath} (Nano reseteando?)`);
                verifiedPorts.set(portPath, { isOurDevice: false, lastChecked: Date.now() });
                cleanup();
                resolve(false);
            }, 7000); // 7 segundos de margen total
            port.on("open", () => {
                // El bootloader del Nano tarda ~2 segundos. Esperamos 2.5s para estar seguros.
                setTimeout(() => {
                    if (port.isOpen) {
                        console.log(`[serial] Handshake -> ${portPath}`);
                        port.write(HANDSHAKE + "\n");
                    }
                }, 2500);
            });
            parser.on("data", (line) => {
                const response = line.trim();
                if (response === FIRMA) {
                    console.log(`[serial] ¡${FIRMA} detectado en ${portPath}!`);
                    verifiedPorts.set(portPath, { isOurDevice: true, lastChecked: Date.now() });
                    cleanup();
                    resolve(true);
                }
            });
            port.on("error", (err) => {
                console.log(`[serial] Error en ${portPath}: ${err.message}`);
                verifiedPorts.set(portPath, { isOurDevice: false, lastChecked: Date.now() });
                cleanup();
                resolve(false);
            });
        }
        catch (e) {
            verifiedPorts.set(portPath, { isOurDevice: false, lastChecked: Date.now() });
            resolve(false);
        }
    });
}
function startAutoConnect() {
    const scan = async () => {
        if (activePort && (activePort.isOpen || activePort.opening)) {
            autoConnectTimer = setTimeout(scan, AUTO_CONNECT_INTERVAL);
            return;
        }
        try {
            const { SerialPort } = require("serialport");
            let allPorts = await SerialPort.list();
            // En Mac, filtrar para usar solo cu.* y evitar doble reset (tty vs cu)
            if (process.platform === "darwin") {
                const cuPorts = allPorts.filter((p) => p.path.startsWith("/dev/cu."));
                if (cuPorts.length > 0)
                    allPorts = cuPorts;
            }
            const candidates = allPorts.filter((p) => isPotentialDevice(p));
            for (const p of candidates) {
                const isOurs = await verifyPort(p.path);
                if (isOurs && (!activePort || !activePort.isOpen)) {
                    connectSerial(p.path, lastBaudRate);
                    break;
                }
            }
        }
        catch (err) {
            console.error("[serial] Scan error:", err);
        }
        autoConnectTimer = setTimeout(scan, AUTO_CONNECT_INTERVAL);
    };
    autoConnectTimer = setTimeout(scan, 1000);
}
function setupSerial() {
    electron_1.ipcMain.handle("list-ports", async () => {
        try {
            const { SerialPort } = require("serialport");
            const allPorts = await SerialPort.list();
            const candidates = allPorts.filter((p) => isPotentialDevice(p) || (activePort && activePort.path === p.path));
            const verificationResults = await Promise.all(candidates.map(async (p) => {
                const isCurrentlyConnected = activePort && activePort.isOpen && activePort.path === p.path;
                const isVerified = isCurrentlyConnected || await verifyPort(p.path);
                return { port: p, isVerified };
            }));
            return verificationResults
                .filter(r => r.isVerified)
                .map(r => {
                const p = r.port;
                if (activePort && activePort.isOpen && activePort.path === p.path) {
                    p.signature = "Conectado";
                }
                else {
                    p.signature = FIRMA;
                }
                return p;
            });
        }
        catch (error) {
            console.error("Failed to list serial ports:", error);
            return [];
        }
    });
    electron_1.ipcMain.on("connect-serial", (_, { port, baud }) => {
        clearReconnect();
        connectSerial(port, baud, false);
    });
    electron_1.ipcMain.on("disconnect-serial", () => {
        clearReconnect();
        lastPortPath = null;
        if (activePort?.isOpen) {
            activePort.close();
        }
    });
    electron_1.ipcMain.on("send-serial", (_, data) => {
        if (activePort?.isOpen)
            activePort.write(data + "\n");
    });
    electron_1.ipcMain.on("cancel-reconnect", () => {
        clearReconnect();
        lastPortPath = null;
        const win = (0, window_1.getWindow)();
        if (win)
            win.webContents.send("serial-status", {
                connected: false,
                reconnecting: false,
            });
    });
    electron_1.ipcMain.handle("get-connection-status", () => {
        return {
            connected: !!(activePort && activePort.isOpen),
            port: lastPortPath,
            baud: lastBaudRate
        };
    });
    // Start the background scanner
    startAutoConnect();
}
function connectSerial(portPath, baudRate = 9600, isReconnect = false) {
    const win = (0, window_1.getWindow)();
    if (activePort?.isOpen) {
        if (activePort.path === portPath)
            return; // Already connected
        try {
            activePort.close();
        }
        catch (_) { }
    }
    let SerialPort, ReadlineParser;
    try {
        ({ SerialPort } = require("serialport"));
        ({ ReadlineParser } = require("@serialport/parser-readline"));
    }
    catch (e) {
        if (win)
            win.webContents.send("serial-error", "serialport no disponible");
        return;
    }
    try {
        activePort = new SerialPort({
            path: portPath,
            baudRate: typeof baudRate === "string" ? parseInt(baudRate) : baudRate,
        });
        const parser = activePort.pipe(new ReadlineParser({ delimiter: "\n" }));
        activePort.on("open", () => {
            lastPortPath = portPath;
            lastBaudRate = typeof baudRate === "string" ? parseInt(baudRate) : baudRate;
            clearReconnect();
            if (win) {
                win.webContents.send("serial-status", {
                    connected: true,
                    reconnecting: false,
                    port: portPath,
                    baud: lastBaudRate,
                });
            }
        });
        parser.on("data", (line) => {
            const signal = line.trim();
            if (!signal)
                return;
            if (win) {
                win.webContents.send("serial-data", { signal, ts: Date.now() });
                // @ts-ignore
                const { executeSequence } = require("./execution");
                executeSequence(signal);
            }
        });
        activePort.on("error", (err) => {
            if (win)
                win.webContents.send("serial-error", err.message);
        });
        activePort.on("close", () => {
            if (win)
                win.webContents.send("serial-status", { connected: false });
        });
    }
    catch (err) {
        if (win)
            win.webContents.send("serial-error", err.message);
    }
}
function getActivePort() {
    return activePort;
}
