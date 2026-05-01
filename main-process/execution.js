const { ipcMain, shell, clipboard, Notification } = require("electron");
const { exec } = require("child_process");
const { getWindow } = require("./window");
const { simulateKey } = require("./keyboard");
const { mediaControl } = require("./media");

let signalMap = {};
const runningSequences = new Set();

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
  
  for (const step of entry.steps) {
    try {
      await executeStep(step);
    } catch (e) {
      if (win) win.webContents.send("serial-error", `[${step.type}] ${e.message}`);
    }
  }
  
  if (win) win.webContents.send("sequence-end", signal);
  runningSequences.delete(signal);
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
  return new Promise((resolve) =>
    exec(cmd, (err, stdout) => {
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
  const os = require("os");
  const fs = require("fs");
  const path = require("path");
  const ext = lang === "javascript" ? ".js" : ".py";
  const interpreter = lang === "javascript" ? "node" : "python";
  const tmpFile = path.join(os.tmpdir(), `pokepad_script_${Date.now()}${ext}`);

  fs.writeFileSync(tmpFile, code, "utf-8");
  const cmd = `${interpreter} "${tmpFile}"`;

  return new Promise((resolve) =>
    exec(cmd, { timeout: 30000 }, (err, stdout, stderr) => {
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
