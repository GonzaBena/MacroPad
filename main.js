const {
  app,
  BrowserWindow,
  ipcMain,
  shell,
  clipboard,
  Notification,
  dialog,
} = require("electron");
const { keyboard, Key } = require('@nut-tree-fork/nut-js');
const { exec } = require("child_process");
const path = require("path");
const os = require("os");
const fs = require("fs");

let win;
let activePort = null;
let signalMap = {}; // { SEÑAL: { label, color, steps: [...] } }

// ── Ventana ───────────────────────────────────────────────────────────────────
function createWindow() {
  win = new BrowserWindow({
    width: 1100,
    height: 700,
    minWidth: 800,
    minHeight: 520,
    frame: false,
    backgroundColor: "#0c0e14",
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  win.loadFile(path.join(__dirname, "renderer", "index.html"));
}

// ── Ejecución de secuencias ───────────────────────────────────────────────────
function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

const runningSequences = new Set();

async function executeSequence(signal) {
  if (runningSequences.has(signal)) return;
  runningSequences.add(signal);

  const entry = signalMap[signal];
  if (!entry || !entry.steps?.length) {
    runningSequences.delete(signal);
    return;
  }
  win.webContents.send("sequence-start", signal);
  for (const step of entry.steps) {
    try {
      await executeStep(step);
    } catch (e) {
      win.webContents.send("serial-error", `[${step.type}] ${e.message}`);
    }
  }
  win.webContents.send("sequence-end", signal);
  runningSequences.delete(signal);
}

async function executeStep(step) {
  switch (step.type) {
    case "keypress":
      await simulateKey(step.params?.combo || "");
      break;
    case "wait":
      await sleep(parseInt(step.params?.ms) || 100);
      break;
    case "clipboard":
      clipboard.writeText(step.params?.text || "");
      break;
    case "media":
      await mediaControl(step.params?.action || "");
      break;
    case "open_url": {
      let targetUrl = step.params?.url || "";
      if (targetUrl && !/^https?:\/\//i.test(targetUrl)) {
        targetUrl = "https://" + targetUrl;
      }
      await shell.openExternal(targetUrl);
      break;
    }
    case "run_cmd":
      await runCmd(step.params?.cmd || "");
      break;
    case "open_file": {
      const error = await shell.openPath(step.params?.path || "");
      if (error) throw new Error(error);
      break;
    }
    case "notify": {
      const title = step.params?.title || "Arduino";
      const body = step.params?.body || "";
      if (Notification.isSupported()) {
        new Notification({ title, body }).show();
      }
      win.webContents.send("show-notification", { title, body });
      break;
    }
  }
}

// ── Simular teclas ────────────────────────────────────────────────────────────
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

function simulateKey(combo) {
  return new Promise((resolve) => {
    if (!combo) return resolve();
    const parts = combo
      .toLowerCase()
      .split("+")
      .map((s) => s.trim());
    const key = parts[parts.length - 1];
    const mods = parts.slice(0, -1);
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

    if (process.platform === "darwin") {
      const code = KEY_CODES_MAC[key];
      const using = modStr ? ` using {${modStr}}` : "";
      const script =
        code != null
          ? `tell application "System Events" to key code ${code}${using}`
          : `tell application "System Events" to keystroke "${key}"${using}`;
      exec(`osascript -e '${script}'`, (err) => {
        if (err)
          win.webContents.send(
            "serial-error",
            "Teclas: necesitás dar permiso de Accesibilidad a la app en Preferencias del Sistema",
          );
        resolve();
      });
    } else if (process.platform === "win32") {
      const modPre = mods
        .map((m) => ({ cmd: "", ctrl: "^", alt: "%", shift: "+" })[m] || "")
        .join("");
      exec(
        `powershell -command "Add-Type -AssemblyName System.Windows.Forms; [System.Windows.Forms.SendKeys]::SendWait('${modPre}${key}')"`,
        () => resolve(),
      );
    } else {
      exec(
        `xdotool key ${combo.replace(/cmd/g, "super").replace(/\+/g, "+")}`,
        () => resolve(),
      );
    }
  });
}

// ── Control de media ──────────────────────────────────────────────────────────
function mediaControl(action) {
  return new Promise((resolve) => {
    if (process.platform === "darwin") {
      _mediaControlMac(action, resolve);
    } else if (process.platform === "win32") {
      _mediaControlWin(action, resolve);
    } else {
      _mediaControlLinux(action, resolve);
    }
  });
}

// ── macOS ─────────────────────────────────────────────────────────────────────
// Usa Python + AppKit para enviar media keys a nivel de sistema.
// No requiere permiso de Automatización — funciona con Spotify, Music,
// Chrome, Safari o cualquier app que esté reproduciendo audio.
//
// NX_KEYTYPE_PLAY = 16, NX_KEYTYPE_FAST (next) = 19, NX_KEYTYPE_REWIND (prev) = 20

function _ensureMacPythonScripts() {
  const makePy = (keyType) =>
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

function _mediaControlMac(action, resolve) {
  const volScripts = {
    vol_up: `set volume output volume (output volume of (get volume settings) + 10)`,
    vol_down: `set volume output volume (output volume of (get volume settings) - 10)`,
    mute: `if output muted of (get volume settings) then\nset volume without output muted\nelse\nset volume with output muted\nend if`,
  };

  if (volScripts[action]) {
    exec(`osascript -e '${volScripts[action]}'`, () => resolve());
    return;
  }

  _ensureMacPythonScripts();

  exec(`python3 /tmp/_media_${action}.py`, (err, stdout, stderr) => {
    if (err)
      win.webContents.send(
        "serial-error",
        `Media [${action}]: ${stderr || err.message}`,
      );
    resolve();
  });
}

// ── Windows ───────────────────────────────────────────────────────────────────
// Escribe un .ps1 temporal para evitar el infierno de escapado inline
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

function _mediaControlWin(action, resolve) {
  const vk = WIN_VK[action];
  if (!vk) return resolve();
  const helper = _ensureWinHelper();
  exec(
    `powershell -ExecutionPolicy Bypass -File "${helper}" -vk ${vk}`,
    (err) => {
      if (err)
        win.webContents.send(
          "serial-error",
          `Media [${action}]: ${err.message}`,
        );
      resolve();
    },
  );
}

// ── Linux ─────────────────────────────────────────────────────────────────────
// Intenta playerctl (universal MPRIS) y cae a xdotool
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

// ─────────────────────────────────────────────────────────────────────────────
function runCmd(cmd) {
  return new Promise((resolve) =>
    exec(cmd, (err, stdout) => {
      win.webContents.send("action-result", {
        cmd,
        ok: !err,
        output: err ? err.message : stdout,
      });
      resolve();
    }),
  );
}

// ── Serial ────────────────────────────────────────────────────────────────────
function connectSerial(portPath, baudRate = 9600) {
  if (activePort?.isOpen) activePort.close();
  let SerialPort, ReadlineParser;
  try {
    ({ SerialPort } = require("serialport"));
    ({ ReadlineParser } = require("@serialport/parser-readline"));
  } catch (e) {
    win.webContents.send(
      "serial-error",
      "serialport no disponible — corré: npx electron-rebuild",
    );
    return;
  }
  try {
    activePort = new SerialPort({
      path: portPath,
      baudRate: parseInt(baudRate),
    });
    const parser = activePort.pipe(new ReadlineParser({ delimiter: "\n" }));
    activePort.on("open", () =>
      win.webContents.send("serial-status", {
        connected: true,
        port: portPath,
        baud: baudRate,
      }),
    );
    parser.on("data", (line) => {
      const signal = line.trim();
      if (!signal) return;
      win.webContents.send("serial-data", { signal, ts: Date.now() });
      executeSequence(signal);
    });
    activePort.on("error", (err) => {
      win.webContents.send("serial-error", err.message);
      win.webContents.send("serial-status", { connected: false });
    });
    activePort.on("close", () =>
      win.webContents.send("serial-status", { connected: false }),
    );
  } catch (err) {
    win.webContents.send("serial-error", err.message);
  }
}

// ── IPC ───────────────────────────────────────────────────────────────────────
ipcMain.handle("list-ports", async () => {
  try {
    const { SerialPort } = require("serialport");
    return await SerialPort.list();
  } catch (error) {
    console.error("Failed to list serial ports:", error);
    return [];
  }
});
ipcMain.handle("select-file", async () => {
  const { canceled, filePaths } = await dialog.showOpenDialog(win, {
    properties: ["openFile", "openDirectory"],
  });
  if (canceled) return null;
  return filePaths[0];
});
ipcMain.on("connect-serial", (_, { port, baud }) => connectSerial(port, baud));
ipcMain.on("disconnect-serial", () => {
  if (activePort?.isOpen)
    activePort.close(() =>
      win.webContents.send("serial-status", { connected: false }),
    );
});
ipcMain.on("update-signal-map", (_, map) => {
  signalMap = map;
});
ipcMain.on("send-serial", (_, data) => {
  if (activePort?.isOpen) activePort.write(data + "\n");
});
ipcMain.on("test-sequence", (_, signal) => executeSequence(signal));

// ── Key capture vía before-input-event (captura Cmd, Ctrl, etc.) ──────────────
let keyCapHandler = null;

ipcMain.on("start-key-capture", () => {
  if (keyCapHandler)
    win.webContents.removeListener("before-input-event", keyCapHandler);
  keyCapHandler = (event, input) => {
    if (input.type !== "keyDown") return;
    if (["Meta", "Control", "Shift", "Alt"].includes(input.key)) return;
    event.preventDefault();
    const mods = [];
    if (input.meta) mods.push("cmd");
    if (input.control) mods.push("ctrl");
    if (input.alt) mods.push("alt");
    if (input.shift) mods.push("shift");
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
    const key =
      keyMap[input.key] ||
      (input.key.length === 1
        ? input.key.toLowerCase()
        : input.key.toLowerCase());
    const combo = [...mods, key].join("+");
    win.webContents.send("key-captured", combo);
    win.webContents.removeListener("before-input-event", keyCapHandler);
    keyCapHandler = null;
  };
  win.webContents.on("before-input-event", keyCapHandler);
});

ipcMain.on("stop-key-capture", () => {
  if (keyCapHandler) {
    win.webContents.removeListener("before-input-event", keyCapHandler);
    keyCapHandler = null;
  }
});
ipcMain.on("win-minimize", () => win.minimize());
ipcMain.on("win-maximize", () =>
  win.isMaximized() ? win.unmaximize() : win.maximize(),
);
ipcMain.on("win-close", () => win.close());

app.whenReady().then(() => {
  createWindow();

  // Escuchas un evento que viene desde tu frontend (Renderer process)
  ipcMain.on('control-multimedia', async (event, accion) => {

    switch (accion) {
      case 'play-pause':
        await keyboard.type(Key.AudioPlay); // Alterna entre Play y Pause en todo el SO
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
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});
