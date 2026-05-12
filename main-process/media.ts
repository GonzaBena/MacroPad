import { ipcMain } from "electron";
import { exec } from "child_process";
import { keyboard, Key } from '@nut-tree-fork/nut-js';
import * as path from "path";
import * as os from "os";
import * as fs from "fs";
// @ts-ignore
import { getWindow } from "./window";

export function setupMedia() {
  ipcMain.on('control-multimedia', async (_event, accion: string) => {
    switch (accion) {
      case 'play-pause':
        await keyboard.type(Key.AudioPlay);
        console.log("Comando enviado: Play/Pause");
        break;
      case 'siguiente':
        await keyboard.type(Key.AudioNext);
        break;
      case 'anterior':
        await keyboard.type(Key.AudioPrev);
        break;
      case 'mute':
        await keyboard.type(Key.AudioMute);
        break;
    }
  });
}

export async function mediaControl(action: string) {
  if (process.platform === "win32") {
    const nutMap: Record<string, Key> = {
      play_pause: Key.AudioPlay,
      next: Key.AudioNext,
      prev: Key.AudioPrev,
      vol_up: Key.AudioVolUp,
      vol_down: Key.AudioVolDown,
      mute: Key.AudioMute,
    };
    if (nutMap[action]) {
      try {
        await Promise.race([
          keyboard.type(nutMap[action]),
          new Promise((_, reject) => setTimeout(() => reject(new Error("NutJS Timeout")), 2000))
        ]);
        return;
      } catch (err: any) {
        console.error("[media] nut-js error:", err.message);
      }
    }
  }

  return new Promise<void>((resolve) => {
    if (process.platform === "darwin") {
      _mediaControlMac(action, resolve);
    } else if (process.platform === "win32") {
      _mediaControlWin(action, resolve);
    } else {
      _mediaControlLinux(action, resolve);
    }
  });
}

// macOS logic
function _ensureMacPythonScripts() {
  const makePy = (keyType: number) =>
    `import objc, AppKit, Quartz
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

function _mediaControlMac(action: string, resolve: () => void) {
  const volScripts: Record<string, string> = {
    vol_up: `set volume output volume (output volume of (get volume settings) + 10)`,
    vol_down: `set volume output volume (output volume of (get volume settings) - 10)`,
    mute: `if output muted of (get volume settings) then\nset volume without output muted\nelse\nset volume with output muted\nend if`,
  };

  if (volScripts[action]) {
    exec(`osascript -e '${volScripts[action]}'`, () => resolve());
    return;
  }

  _ensureMacPythonScripts();
  exec(`python3 /tmp/_media_${action}.py`, (err, _stdout, stderr) => {
    const win = getWindow();
    if (err && win)
      win.webContents.send("serial-error", `Media [${action}]: ${stderr || err.message}`);
    resolve();
  });
}

// Windows logic
const WIN_VK: Record<string, string> = {
  play_pause: "0xB3",
  next: "0xB0",
  prev: "0xB1",
  vol_up: "0xAF",
  vol_down: "0xAE",
  mute: "0xAD",
};

let _winHelperPath: string | null = null;

function _ensureWinHelper() {
  if (_winHelperPath) return _winHelperPath;
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

function _mediaControlWin(action: string, resolve: () => void) {
  const vk = WIN_VK[action];
  if (!vk) return resolve();
  const helper = _ensureWinHelper();
  exec(`powershell -ExecutionPolicy Bypass -File "${helper}" -vk ${vk}`, (err) => {
    const win = getWindow();
    if (err && win) win.webContents.send("serial-error", `Media [${action}]: ${err.message}`);
    resolve();
  });
}

// Linux logic
const LINUX_PLAYERCTL: Record<string, string> = {
  play_pause: "play-pause",
  next: "next",
  prev: "previous",
};
const LINUX_XDOTOOL: Record<string, string> = {
  play_pause: "XF86AudioPlay",
  next: "XF86AudioNext",
  prev: "XF86AudioPrev",
  vol_up: "XF86AudioRaiseVolume",
  vol_down: "XF86AudioLowerVolume",
  mute: "XF86AudioMute",
};

function _mediaControlLinux(action: string, resolve: () => void) {
  const pctl = LINUX_PLAYERCTL[action];
  if (pctl) {
    exec(`playerctl ${pctl}`, (err) => {
      if (!err) return resolve();
      const xdo = LINUX_XDOTOOL[action];
      if (xdo) exec(`xdotool key ${xdo}`, () => resolve());
      else resolve();
    });
  } else {
    const xdo = LINUX_XDOTOOL[action];
    if (xdo) exec(`xdotool key ${xdo}`, () => resolve());
    else resolve();
  }
}
