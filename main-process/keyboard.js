const { ipcMain } = require("electron");
const { exec } = require("child_process");
const { getWindow } = require("./window");

const KEY_CODES_MAC = {
  enter: 33, return: 36, tab: 48, space: 49, escape: 53, esc: 53,
  backspace: 51, delete: 51, up: 126, down: 125, left: 123, right: 124,
  home: 115, end: 119, pageup: 116, pagedown: 121,
  f1: 122, f2: 120, f3: 99, f4: 118, f5: 96, f6: 97, f7: 98, f8: 100,
  f9: 101, f10: 109, f11: 103, f12: 111,
};

let keyCapHandler = null;

function setupKeyboard() {
  ipcMain.on("start-key-capture", () => {
    const win = getWindow();
    if (!win) return;
    if (keyCapHandler) win.webContents.removeListener("before-input-event", keyCapHandler);
    
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
        " ": "space", ArrowUp: "up", ArrowDown: "down",
        ArrowLeft: "left", ArrowRight: "right", Enter: "return",
        Backspace: "backspace", Tab: "tab", Escape: "escape",
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

function simulateKey(combo) {
  return new Promise((resolve) => {
    if (!combo) return resolve();
    const win = getWindow();
    const parts = combo.toLowerCase().split("+").map((s) => s.trim());
    const key = parts[parts.length - 1];
    const mods = parts.slice(0, -1);
    const modMap = {
      cmd: "command down", command: "command down",
      ctrl: "control down", control: "control down",
      alt: "option down", option: "option down",
      shift: "shift down",
    };
    const modStr = mods.map((m) => modMap[m]).filter(Boolean).join(", ");

    if (process.platform === "darwin") {
      const code = KEY_CODES_MAC[key];
      const using = modStr ? ` using {${modStr}}` : "";
      const script = code != null
          ? `tell application "System Events" to key code ${code}${using}`
          : `tell application "System Events" to keystroke "${key}"${using}`;
      exec(`osascript -e '${script}'`, (err) => {
        if (err && win)
          win.webContents.send("serial-error", "Teclas: necesitás dar permiso de Accesibilidad a la app");
        resolve();
      });
    } else if (process.platform === "win32") {
      const modPre = mods.map((m) => ({ cmd: "", ctrl: "^", alt: "%", shift: "+" })[m] || "").join("");
      exec(`powershell -command "Add-Type -AssemblyName System.Windows.Forms; [System.Windows.Forms.SendKeys]::SendWait('${modPre}${key}')"`, () => resolve());
    } else {
      exec(`xdotool key ${combo.replace(/cmd/g, "super").replace(/\+/g, "+")}`, () => resolve());
    }
  });
}

module.exports = {
  setupKeyboard,
  simulateKey,
};
