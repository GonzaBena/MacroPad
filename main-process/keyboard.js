"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.setupKeyboard = setupKeyboard;
exports.escapePowerShell = escapePowerShell;
exports.simulateKey = simulateKey;
exports.listInstalledApps = listInstalledApps;
exports.listRunningApps = listRunningApps;
const electron_1 = require("electron");
const child_process_1 = require("child_process");
const nut_js_1 = require("@nut-tree-fork/nut-js");
// @ts-ignore
const window_1 = require("./window");
const NUT_KEY_MAP = {
    enter: nut_js_1.Key.Enter,
    return: nut_js_1.Key.Enter,
    tab: nut_js_1.Key.Tab,
    space: nut_js_1.Key.Space,
    escape: nut_js_1.Key.Escape,
    esc: nut_js_1.Key.Escape,
    backspace: nut_js_1.Key.Backspace,
    delete: nut_js_1.Key.Delete,
    up: nut_js_1.Key.Up,
    down: nut_js_1.Key.Down,
    left: nut_js_1.Key.Left,
    right: nut_js_1.Key.Right,
    home: nut_js_1.Key.Home,
    end: nut_js_1.Key.End,
    pageup: nut_js_1.Key.PageUp,
    pagedown: nut_js_1.Key.PageDown,
    f1: nut_js_1.Key.F1,
    f2: nut_js_1.Key.F2,
    f3: nut_js_1.Key.F3,
    f4: nut_js_1.Key.F4,
    f5: nut_js_1.Key.F5,
    f6: nut_js_1.Key.F6,
    f7: nut_js_1.Key.F7,
    f8: nut_js_1.Key.F8,
    f9: nut_js_1.Key.F9,
    f10: nut_js_1.Key.F10,
    f11: nut_js_1.Key.F11,
    f12: nut_js_1.Key.F12,
    ins: nut_js_1.Key.Insert,
    insert: nut_js_1.Key.Insert,
    prtsc: nut_js_1.Key.Print,
    scrolllock: nut_js_1.Key.ScrollLock,
    pause: nut_js_1.Key.Pause,
};
const NUT_MOD_MAP = {
    cmd: nut_js_1.Key.LeftSuper,
    command: nut_js_1.Key.LeftSuper,
    ctrl: nut_js_1.Key.LeftControl,
    control: nut_js_1.Key.LeftControl,
    alt: nut_js_1.Key.LeftAlt,
    option: nut_js_1.Key.LeftAlt,
    shift: nut_js_1.Key.LeftShift,
};
function getNutKey(k) {
    const lower = k.toLowerCase();
    if (NUT_KEY_MAP[lower])
        return NUT_KEY_MAP[lower];
    // Alphanumeric
    if (k.length === 1) {
        const char = k.toUpperCase();
        if (char >= "A" && char <= "Z")
            return nut_js_1.Key[char];
        if (char >= "0" && char <= "9")
            return nut_js_1.Key["Num" + char];
    }
    return null;
}
const KEY_CODES_MAC = {
    enter: 33,
    return: 36,
    tab: 48,
    space: 49,
    escape: 53,
    esc: 53,
    backspace: 51,
    delete: 51,
    up: 126,
    down: 125,
    left: 123,
    right: 124,
    home: 115,
    end: 119,
    pageup: 116,
    pagedown: 121,
    f1: 122,
    f2: 120,
    f3: 99,
    f4: 118,
    f5: 96,
    f6: 97,
    f7: 98,
    f8: 100,
    f9: 101,
    f10: 109,
    f11: 103,
    f12: 111,
};
let keyCapHandler = null;
function setupKeyboard() {
    electron_1.ipcMain.on("start-key-capture", () => {
        const win = (0, window_1.getWindow)();
        if (!win)
            return;
        if (keyCapHandler)
            win.webContents.removeListener("before-input-event", keyCapHandler);
        keyCapHandler = (event, input) => {
            if (input.type !== "keyDown")
                return;
            if (["Meta", "Control", "Shift", "Alt"].includes(input.key))
                return;
            event.preventDefault();
            const mods = [];
            if (input.meta)
                mods.push("cmd");
            if (input.control)
                mods.push("ctrl");
            if (input.alt)
                mods.push("alt");
            if (input.shift)
                mods.push("shift");
            const keyMap = {
                " ": "space",
                ArrowUp: "up",
                ArrowDown: "down",
                ArrowLeft: "left",
                ArrowRight: "right",
                Enter: "return",
                Backspace: "backspace",
                Tab: "tab",
                Escape: "escape",
            };
            const key = keyMap[input.key] || input.key.toLowerCase();
            const combo = [...mods, key].join("+");
            win.webContents.send("key-captured", combo);
            win.webContents.removeListener("before-input-event", keyCapHandler);
            keyCapHandler = null;
        };
        win.webContents.on("before-input-event", keyCapHandler);
    });
    electron_1.ipcMain.on("stop-key-capture", () => {
        const win = (0, window_1.getWindow)();
        if (win && keyCapHandler) {
            win.webContents.removeListener("before-input-event", keyCapHandler);
            keyCapHandler = null;
        }
    });
}
/**
 * Escape a string for safe inclusion in PowerShell commands.
 * Prevents injection via crafted key combo values.
 */
function escapePowerShell(str) {
    // Only allow safe characters for key simulation
    return str.replace(/[^a-zA-Z0-9+\-_ ]/g, "");
}
async function simulateKey(combo) {
    if (!combo)
        return;
    const win = (0, window_1.getWindow)();
    const parts = combo
        .toLowerCase()
        .replace(/"/g, "")
        .split("+")
        .map((s) => s.trim());
    const keyPart = parts[parts.length - 1];
    const mods = parts.slice(0, -1);
    // Validation
    if (escapePowerShell(keyPart) !== keyPart) {
        if (win)
            win.webContents.send("serial-error", `Tecla inválida: ${keyPart}`);
        return;
    }
    for (const mod of mods) {
        if (!NUT_MOD_MAP[mod]) {
            if (win)
                win.webContents.send("serial-error", `Modificador inválido: ${mod}`);
            return;
        }
    }
    // Use nut-js for native speed on Windows and Mac
    if (process.platform === "win32" || process.platform === "darwin") {
        try {
            const nutKeys = [];
            for (const mod of mods) {
                if (NUT_MOD_MAP[mod])
                    nutKeys.push(NUT_MOD_MAP[mod]);
            }
            const mainKey = getNutKey(keyPart);
            if (mainKey) {
                nutKeys.push(mainKey);
                // Timeout protected nut-js call
                await Promise.race([
                    (async () => {
                        await nut_js_1.keyboard.pressKey(...nutKeys);
                        await nut_js_1.keyboard.releaseKey(...nutKeys);
                    })(),
                    new Promise((_, reject) => setTimeout(() => reject(new Error("NutJS Timeout")), 2000)),
                ]);
                return;
            }
        }
        catch (err) {
            console.error("[keyboard] nut-js error:", err.message);
            // Fallback to legacy methods if nut-js fails or times out
        }
    }
    // Legacy fallback or Linux (xdotool)
    if (process.platform === "darwin") {
        const code = KEY_CODES_MAC[keyPart];
        const modMap = {
            cmd: "command down",
            command: "command down",
            ctrl: "control down",
            control: "control down",
            alt: "option down",
            option: "option down",
            shift: "shift down",
        };
        const modStr = mods
            .map((m) => modMap[m])
            .filter(Boolean)
            .join(", ");
        const using = modStr ? ` using {${modStr}}` : "";
        const script = code != null
            ? `tell application "System Events" to key code ${code}${using}`
            : `tell application "System Events" to keystroke "${keyPart}"${using}`;
        (0, child_process_1.exec)(`osascript -e '${script}'`, (err) => {
            if (err && win)
                win.webContents.send("serial-error", "Teclas: necesitás dar permiso de Accesibilidad a la app");
        });
    }
    else if (process.platform === "win32") {
        const safeKey = escapePowerShell(keyPart);
        const modPre = mods
            .map((m) => ({ cmd: "", ctrl: "^", alt: "%", shift: "+" }[m] || ""))
            .join("");
        const sendKeysArg = `${modPre}${safeKey}`;
        const psScript = `Add-Type -AssemblyName System.Windows.Forms; [System.Windows.Forms.SendKeys]::SendWait('${sendKeysArg}')`;
        (0, child_process_1.execFile)("powershell", ["-NoProfile", "-NonInteractive", "-Command", psScript], (err) => {
            if (err && win)
                win.webContents.send("serial-error", `Teclas: ${err.message}`);
        });
    }
    else {
        const safeCombo = escapePowerShell(combo).replace(/cmd/g, "super");
        (0, child_process_1.execFile)("xdotool", ["key", safeCombo]);
    }
}
async function listInstalledApps() {
    return new Promise((resolve) => {
        if (process.platform === "win32") {
            const cmd = `powershell -NoProfile -Command "Get-StartApps | Select-Object Name, AppID | ConvertTo-Json -Compress"`;
            (0, child_process_1.exec)(cmd, { timeout: 10000 }, (err, stdout) => {
                if (err || !stdout) {
                    resolve([]);
                    return;
                }
                try {
                    const raw = JSON.parse(stdout);
                    const list = Array.isArray(raw) ? raw : [raw];
                    const apps = list
                        .filter(a => a.Name && a.AppID)
                        .map(a => ({
                        name: a.Name,
                        path: a.AppID.includes("\\") ? a.AppID : `shell:AppsFolder\\${a.AppID}`
                    }))
                        .sort((a, b) => a.name.localeCompare(b.name));
                    resolve(apps);
                }
                catch (e) {
                    resolve([]);
                }
            });
        }
        else if (process.platform === "darwin") {
            const fs = require("fs");
            const path = require("path");
            const dirs = ["/Applications", path.join(process.env.HOME || "", "Applications")];
            const apps = [];
            dirs.forEach(dir => {
                if (fs.existsSync(dir)) {
                    fs.readdirSync(dir).forEach((file) => {
                        if (file.endsWith(".app")) {
                            const name = file.replace(".app", "");
                            apps.push({ name, path: path.join(dir, file) });
                        }
                    });
                }
            });
            resolve(apps.sort((a, b) => a.name.localeCompare(b.name)));
        }
        else {
            resolve([]);
        }
    });
}
async function listRunningApps() {
    return new Promise((resolve) => {
        if (process.platform === "win32") {
            // Solo procesos con ventana principal visible, obteniendo Nombre y Ruta
            const cmd = `powershell -NoProfile -Command "Get-Process | Where-Object { $_.MainWindowTitle -ne '' } | Select-Object -Property ProcessName, Path | ConvertTo-Json -Compress"`;
            (0, child_process_1.exec)(cmd, { timeout: 7000 }, (err, stdout) => {
                if (err || !stdout) {
                    resolve([]);
                    return;
                }
                try {
                    const raw = JSON.parse(stdout);
                    const list = Array.isArray(raw) ? raw : [raw];
                    const apps = list
                        .filter(p => p.ProcessName && p.Path)
                        .map(p => ({
                        name: p.ProcessName.endsWith(".exe") ? p.ProcessName : p.ProcessName + ".exe",
                        path: p.Path
                    }))
                        .sort((a, b) => a.name.localeCompare(b.name));
                    // Eliminar duplicados por ruta
                    const seen = new Set();
                    const unique = apps.filter(a => {
                        if (seen.has(a.path))
                            return false;
                        seen.add(a.path);
                        return true;
                    });
                    resolve(unique);
                }
                catch (e) {
                    console.error("[keyboard] Error parsing running apps JSON:", e.message);
                    resolve([]);
                }
            });
        }
        else if (process.platform === "darwin") {
            // Solo apps de primer plano (no servicios ni daemons)
            const cmd = `osascript -e 'tell application "System Events" to get name of (processes where background only is false)'`;
            (0, child_process_1.exec)(cmd, { timeout: 5000 }, (err, stdout) => {
                if (err) {
                    resolve([]);
                    return;
                }
                const apps = stdout
                    .trim()
                    .split(",")
                    .map((l) => l.trim())
                    .filter((l) => l.length > 0)
                    .map(name => ({ name, path: name })) // En Mac solemos usar el nombre para open -a
                    .sort((a, b) => a.name.localeCompare(b.name));
                resolve(apps);
            });
        }
        else {
            resolve([]);
        }
    });
}
