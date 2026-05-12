"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.setupMedia = setupMedia;
exports.mediaControl = mediaControl;
const electron_1 = require("electron");
const child_process_1 = require("child_process");
const nut_js_1 = require("@nut-tree-fork/nut-js");
const path = __importStar(require("path"));
const os = __importStar(require("os"));
const fs = __importStar(require("fs"));
// @ts-ignore
const window_1 = require("./window");
function setupMedia() {
    electron_1.ipcMain.on('control-multimedia', async (_event, accion) => {
        switch (accion) {
            case 'play-pause':
                await nut_js_1.keyboard.type(nut_js_1.Key.AudioPlay);
                console.log("Comando enviado: Play/Pause");
                break;
            case 'siguiente':
                await nut_js_1.keyboard.type(nut_js_1.Key.AudioNext);
                break;
            case 'anterior':
                await nut_js_1.keyboard.type(nut_js_1.Key.AudioPrev);
                break;
            case 'mute':
                await nut_js_1.keyboard.type(nut_js_1.Key.AudioMute);
                break;
        }
    });
}
async function mediaControl(action) {
    if (process.platform === "win32") {
        const nutMap = {
            play_pause: nut_js_1.Key.AudioPlay,
            next: nut_js_1.Key.AudioNext,
            prev: nut_js_1.Key.AudioPrev,
            vol_up: nut_js_1.Key.AudioVolUp,
            vol_down: nut_js_1.Key.AudioVolDown,
            mute: nut_js_1.Key.AudioMute,
        };
        if (nutMap[action]) {
            try {
                await Promise.race([
                    nut_js_1.keyboard.type(nutMap[action]),
                    new Promise((_, reject) => setTimeout(() => reject(new Error("NutJS Timeout")), 2000))
                ]);
                return;
            }
            catch (err) {
                console.error("[media] nut-js error:", err.message);
            }
        }
    }
    return new Promise((resolve) => {
        if (process.platform === "darwin") {
            _mediaControlMac(action, resolve);
        }
        else if (process.platform === "win32") {
            _mediaControlWin(action, resolve);
        }
        else {
            _mediaControlLinux(action, resolve);
        }
    });
}
// macOS logic
function _ensureMacPythonScripts() {
    const makePy = (keyType) => `import objc, AppKit, Quartz
def tap(kt, down):
    flags = 0xa00 if down else 0xb00
    d1 = (kt << 16) | ((0xa if down else 0xb) << 8)
    ev = AppKit.NSEvent.otherEventWithType_location_modifierFlags_timestamp_windowNumber_context_subtype_data1_data2_(
        14, AppKit.NSPoint(0, 0), flags, 0, 0, None, 8, d1, -1)
    Quartz.CGEventPost(0, ev.CGEvent())
tap(${keyType}, True)
tap(${keyType}, False)`;
    fs.writeFileSync("/tmp/_media_play_pause.py", makePy(16), "utf8");
    fs.writeFileSync("/tmp/_media_next.py", makePy(19), "utf8");
    fs.writeFileSync("/tmp/_media_prev.py", makePy(20), "utf8");
}
function _mediaControlMac(action, resolve) {
    const volScripts = {
        vol_up: `set volume output volume (output volume of (get volume settings) + 10)`,
        vol_down: `set volume output volume (output volume of (get volume settings) - 10)`,
        mute: `if output muted of (get volume settings) then\nset volume without output muted\nelse\nset volume with output muted\nend if`,
    };
    if (volScripts[action]) {
        (0, child_process_1.exec)(`osascript -e '${volScripts[action]}'`, () => resolve());
        return;
    }
    _ensureMacPythonScripts();
    (0, child_process_1.exec)(`python3 /tmp/_media_${action}.py`, (err, _stdout, stderr) => {
        const win = (0, window_1.getWindow)();
        if (err && win)
            win.webContents.send("serial-error", `Media [${action}]: ${stderr || err.message}`);
        resolve();
    });
}
// Windows logic
const WIN_VK = {
    play_pause: "0xB3",
    next: "0xB0",
    prev: "0xB1",
    vol_up: "0xAF",
    vol_down: "0xAE",
    mute: "0xAD",
};
let _winHelperPath = null;
function _ensureWinHelper() {
    if (_winHelperPath)
        return _winHelperPath;
    _winHelperPath = path.join(os.tmpdir(), "_media_key_helper.ps1");
    const ps1 = `param([string]$vk)
Add-Type -TypeDefinition @"
using System;
using System.Runtime.InteropServices;
public class MediaKey {
    [DllImport("user32.dll")] public static extern void keybd_event(byte bVk, byte bScan, uint dwFlags, int dwExtraInfo);
    public static void Tap(int vk) {
        keybd_event((byte)vk, 0, 1, 0);
        keybd_event((byte)vk, 0, 3, 0);
    }
}
"@
[MediaKey]::Tap([Convert]::ToInt32($vk, 16))`;
    fs.writeFileSync(_winHelperPath, ps1, "utf8");
    return _winHelperPath;
}
function _mediaControlWin(action, resolve) {
    const vk = WIN_VK[action];
    if (!vk)
        return resolve();
    const helper = _ensureWinHelper();
    (0, child_process_1.exec)(`powershell -ExecutionPolicy Bypass -File "${helper}" -vk ${vk}`, (err) => {
        const win = (0, window_1.getWindow)();
        if (err && win)
            win.webContents.send("serial-error", `Media [${action}]: ${err.message}`);
        resolve();
    });
}
// Linux logic
const LINUX_PLAYERCTL = {
    play_pause: "play-pause",
    next: "next",
    prev: "previous",
};
const LINUX_XDOTOOL = {
    play_pause: "XF86AudioPlay",
    next: "XF86AudioNext",
    prev: "XF86AudioPrev",
    vol_up: "XF86AudioRaiseVolume",
    vol_down: "XF86AudioLowerVolume",
    mute: "XF86AudioMute",
};
function _mediaControlLinux(action, resolve) {
    const pctl = LINUX_PLAYERCTL[action];
    if (pctl) {
        (0, child_process_1.exec)(`playerctl ${pctl}`, (err) => {
            if (!err)
                return resolve();
            const xdo = LINUX_XDOTOOL[action];
            if (xdo)
                (0, child_process_1.exec)(`xdotool key ${xdo}`, () => resolve());
            else
                resolve();
        });
    }
    else {
        const xdo = LINUX_XDOTOOL[action];
        if (xdo)
            (0, child_process_1.exec)(`xdotool key ${xdo}`, () => resolve());
        else
            resolve();
    }
}
