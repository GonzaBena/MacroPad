const { ipcMain } = require("electron");
const { exec, execFile } = require("child_process");
const { keyboard, Key } = require("@nut-tree-fork/nut-js");
const { getWindow } = require("./window");

const NUT_KEY_MAP = {
  enter: Key.Enter,
  return: Key.Enter,
  tab: Key.Tab,
  space: Key.Space,
  escape: Key.Escape,
  esc: Key.Escape,
  backspace: Key.Backspace,
  delete: Key.Delete,
  up: Key.Up,
  down: Key.Down,
  left: Key.Left,
  right: Key.Right,
  home: Key.Home,
  end: Key.End,
  pageup: Key.PageUp,
  pagedown: Key.PageDown,
  f1: Key.F1,
  f2: Key.F2,
  f3: Key.F3,
  f4: Key.F4,
  f5: Key.F5,
  f6: Key.F6,
  f7: Key.F7,
  f8: Key.F8,
  f9: Key.F9,
  f10: Key.F10,
  f11: Key.F11,
  f12: Key.F12,
  ins: Key.Insert,
  insert: Key.Insert,
  prtsc: Key.Print,
  scrolllock: Key.ScrollLock,
  pause: Key.Pause,
};

const NUT_MOD_MAP = {
  cmd: Key.LeftSuper,
  command: Key.LeftSuper,
  ctrl: Key.LeftControl,
  control: Key.LeftControl,
  alt: Key.LeftAlt,
  option: Key.LeftAlt,
  shift: Key.LeftShift,
};

function getNutKey(k) {
  const lower = k.toLowerCase();
  if (NUT_KEY_MAP[lower]) return NUT_KEY_MAP[lower];

  // Alphanumeric
  if (k.length === 1) {
    const char = k.toUpperCase();
    if (char >= "A" && char <= "Z") return Key[char];
    if (char >= "0" && char <= "9") return Key["Num" + char];
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
  ipcMain.on("start-key-capture", () => {
    const win = getWindow();
    if (!win) return;
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
      const key = keyMap[input.key] || input.key.toLowerCase();
      const combo = [...mods, key].join("+");
      win.webContents.send("key-captured", combo);
      win.webContents.removeListener("before-input-event", keyCapHandler);
      keyCapHandler = null;
    };
    win.webContents.on("before-input-event", keyCapHandler);
  });

  ipcMain.on("stop-key-capture", () => {
    const win = getWindow();
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
  if (!combo) return;
  const win = getWindow();
  const parts = combo
    .toLowerCase()
    .replace(/"/g, "")
    .split("+")
    .map((s) => s.trim());
  const keyPart = parts[parts.length - 1];
  const mods = parts.slice(0, -1);

  // Use nut-js for native speed on Windows and Mac
  if (process.platform === "win32" || process.platform === "darwin") {
    try {
      const nutKeys = [];
      for (const mod of mods) {
        if (NUT_MOD_MAP[mod]) nutKeys.push(NUT_MOD_MAP[mod]);
      }
      const mainKey = getNutKey(keyPart);
      if (mainKey) {
        nutKeys.push(mainKey);
        // Timeout protected nut-js call
        await Promise.race([
          (async () => {
            await keyboard.pressKey(...nutKeys);
            await keyboard.releaseKey(...nutKeys);
          })(),
          new Promise((_, reject) =>
            setTimeout(() => reject(new Error("NutJS Timeout")), 2000),
          ),
        ]);
        return;
      }
    } catch (err) {
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
    const script =
      code != null
        ? `tell application "System Events" to key code ${code}${using}`
        : `tell application "System Events" to keystroke "${keyPart}"${using}`;
    exec(`osascript -e '${script}'`, (err) => {
      if (err && win)
        win.webContents.send(
          "serial-error",
          "Teclas: necesitás dar permiso de Accesibilidad a la app",
        );
    });
  } else if (process.platform === "win32") {
    const safeKey = escapePowerShell(keyPart);
    const modPre = mods
      .map((m) => ({ cmd: "", ctrl: "^", alt: "%", shift: "+" })[m] || "")
      .join("");
    const sendKeysArg = `${modPre}${safeKey}`;
    const psScript = `Add-Type -AssemblyName System.Windows.Forms; [System.Windows.Forms.SendKeys]::SendWait('${sendKeysArg}')`;
    execFile(
      "powershell",
      ["-NoProfile", "-NonInteractive", "-Command", psScript],
      (err) => {
        if (err && win)
          win.webContents.send("serial-error", `Teclas: ${err.message}`);
      },
    );
  } else {
    const safeCombo = escapePowerShell(combo).replace(/cmd/g, "super");
    execFile("xdotool", ["key", safeCombo]);
  }
}

module.exports = {
  setupKeyboard,
  simulateKey,
  escapePowerShell,
  listRunningApps,
};

async function listRunningApps() {
  return new Promise((resolve) => {
    if (process.platform === "win32") {
      // Solo procesos con ventana principal visible
      const cmd = `powershell -NoProfile -Command "Get-Process | Where-Object { $_.MainWindowTitle -ne '' } | Sort-Object ProcessName -Unique | Select-Object -ExpandProperty ProcessName"`;

      exec(cmd, { timeout: 5000 }, (err, stdout) => {
        if (err) {
          resolve([]);
          return;
        }

        const apps = stdout
          .split("\n")
          .map((l) => l.trim())
          .filter((l) => l.length > 0)
          .map((name) => (name.endsWith(".exe") ? name : name + ".exe"))
          .sort();

        resolve(apps);
      });
    } else if (process.platform === "darwin") {
      // Solo apps de primer plano (no servicios ni daemons)
      const cmd = `osascript -e 'tell application "System Events" to get name of (processes where background only is false)'`;

      exec(cmd, { timeout: 5000 }, (err, stdout) => {
        if (err) {
          resolve([]);
          return;
        }

        const apps = stdout
          .trim()
          .split(",")
          .map((l) => l.trim())
          .filter((l) => l.length > 0)
          .sort();

        resolve(apps);
      });
    } else {
      resolve([]);
    }
  });
}
