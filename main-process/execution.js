const { ipcMain, shell, clipboard, Notification } = require("electron");
const { execFile, exec } = require("child_process");
const { getWindow } = require("./window");
const { simulateKey } = require("./keyboard");
const { mediaControl } = require("./media");
const os = require("os");
const fs = require("fs");
const path = require("path");

let signalMap = {};
const runningSequences = new Set();

// Private temp directory for scripts
const SCRIPT_DIR = path.join(os.tmpdir(), "pokepad_scripts");
try { fs.mkdirSync(SCRIPT_DIR, { recursive: true }); } catch (_) {}

// Maximum command length to prevent abuse
const MAX_CMD_LENGTH = 4096;

function setupExecution() {
  ipcMain.on("update-signal-map", (_, map) => {
    signalMap = map;
  });

  ipcMain.on("test-sequence", (_, signal) => executeSequence(signal));
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function executeSequence(incomingSignal) {
  const win = getWindow();

  let signal = incomingSignal;
  let entry = signalMap[signal];

  // Si el Arduino envía PRESIONADO y no tenemos una señal con ese nombre exacto,
  // buscamos la señal que el usuario asignó al botón físico.
  if (!entry && incomingSignal === "PRESIONADO") {
    for (const key in signalMap) {
      if (signalMap[key].assignedToButton) {
        entry = signalMap[key];
        signal = key; // Reasignamos para que la UI muestre el nombre real
        break;
      }
    }
  }

  if (runningSequences.has(signal)) return;
  runningSequences.add(signal);

  if (!entry || !entry.steps?.length) {
    runningSequences.delete(signal);
    return;
  }

  if (win) win.webContents.send("sequence-start", signal);

  try {
    for (const step of entry.steps) {
      try {
        await executeStep(step);
      } catch (e) {
        if (win) win.webContents.send("serial-error", `[${step.type}] ${e.message}`);
      }
    }
  } finally {
    // Siempre limpiar el estado, incluso si hay error inesperado
    if (win) win.webContents.send("sequence-end", signal);
    runningSequences.delete(signal);
  }
}

async function executeStep(step) {
  const win = getWindow();
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
      if (targetUrl && !/^https?:\/\//i.test(targetUrl)) targetUrl = "https://" + targetUrl;
      // Validar estrictamente que solo se permitan URLs HTTP/HTTPS
      try {
        const parsed = new URL(targetUrl);
        if (!["http:", "https:"].includes(parsed.protocol)) {
          throw new Error(`Protocolo no permitido: ${parsed.protocol}`);
        }
        await shell.openExternal(parsed.href);
      } catch (e) {
        throw new Error(`URL inválida: ${e.message}`);
      }
      break;
    }
    case "run_cmd":
      await runCmd(step.params?.cmd || "");
      break;
    case "open_file": {
      const filePath = step.params?.path || "";
      // Validar que el path no esté vacío y que exista
      if (!filePath) throw new Error("Ruta vacía");
      const error = await shell.openPath(filePath);
      if (error) throw new Error(error);
      break;
    }
    case "notify": {
      const title = step.params?.title || "Arduino";
      const body = step.params?.body || "";
      if (Notification.isSupported()) new Notification({ title, body }).show();
      if (win) win.webContents.send("show-notification", { title, body });
      break;
    }
    case "run_script": {
      await runScript(step.params?.lang || "python", step.params?.code || "");
      break;
    }
  }
}

function runCmd(cmd) {
  const win = getWindow();

  // Validar longitud del comando
  if (cmd.length > MAX_CMD_LENGTH) {
    if (win) {
      win.webContents.send("action-result", {
        cmd, ok: false, output: `Comando demasiado largo (máx ${MAX_CMD_LENGTH} chars)`,
      });
    }
    return Promise.resolve();
  }

  return new Promise((resolve) =>
    exec(cmd, { timeout: 30000 }, (err, stdout) => {
      if (win) {
        win.webContents.send("action-result", {
          cmd, ok: !err, output: err ? err.message : stdout,
        });
      }
      resolve();
    })
  );
}

function runScript(lang, code) {
  const win = getWindow();

  // Validar lenguaje permitido
  const allowedLangs = { python: ".py", javascript: ".js" };
  const ext = allowedLangs[lang];
  if (!ext) {
    if (win) {
      win.webContents.send("action-result", {
        cmd: `[Script ${lang}]`, ok: false, output: `Lenguaje no soportado: ${lang}`,
      });
    }
    return Promise.resolve();
  }

  const interpreter = lang === "javascript" ? "node" : "python";
  const tmpFile = path.join(SCRIPT_DIR, `script_${Date.now()}${ext}`);

  try {
    fs.writeFileSync(tmpFile, code, { encoding: "utf-8", mode: 0o600 });
  } catch (writeErr) {
    if (win) {
      win.webContents.send("action-result", {
        cmd: `[Script ${lang}]`, ok: false, output: `Error escribiendo script: ${writeErr.message}`,
      });
    }
    return Promise.resolve();
  }

  return new Promise((resolve) =>
    execFile(interpreter, [tmpFile], { timeout: 30000 }, (err, stdout, stderr) => {
      // Clean up temp file
      try { fs.unlinkSync(tmpFile); } catch (_) {}

      const output = (stdout || "") + (stderr || "");
      if (win) {
        win.webContents.send("action-result", {
          cmd: `[Script ${lang}]`,
          ok: !err,
          output: err ? (err.killed ? "Script timed out (30s)" : output || err.message) : output,
        });
      }
      resolve();
    })
  );
}

module.exports = {
  setupExecution,
  executeSequence,
};
