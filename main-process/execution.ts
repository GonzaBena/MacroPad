import { ipcMain, shell, clipboard, Notification } from "electron";
import { execFile, exec } from "child_process";
import log from './logger';
// @ts-ignore
import { getWindow } from "./window";
import { executePlugin } from "./plugins";
import { UpdateSignalMapSchema, UpdateGlobalVarsSchema, TestSequenceSchema } from "../src/types/ipc-schemas";
// @ts-ignore
import { simulateKey } from "./keyboard";
// @ts-ignore
import { mediaControl } from "./media";
import * as os from "os";
import * as fs from "fs";
import * as path from "path";
import { 
  Step, 
  SignalMap, 
  GlobalVariables, 
  ExecutionContext, 
  SignalEntry 
} from "../src/types/pokepad";

let signalMap: SignalMap = {};
let globalVars: GlobalVariables = {};
const runningSequences = new Set<string>();
let promptForRegionFn: (() => Promise<{ x: number; y: number; width: number; height: number } | null>) | null = null;

// Private temp directory for scripts
const SCRIPT_DIR = path.join(os.tmpdir(), "pokepad_scripts");
try {
  fs.mkdirSync(SCRIPT_DIR, { recursive: true });
} catch (_) {}

// Maximum command length to prevent abuse
const MAX_CMD_LENGTH = 4096;

/**
 * Initialises the execution engine by setting up IPC listeners and injection functions.
 * @param promptRegion Callback to trigger region selection on the renderer side.
 */
export function setupExecution(promptRegion: () => Promise<any>) {
  promptForRegionFn = promptRegion;
  ipcMain.on("update-signal-map", (_, map: unknown) => {
    const result = UpdateSignalMapSchema.safeParse(map);
    if (!result.success) return;
    signalMap = result.data as SignalMap;
  });

  ipcMain.on("update-global-vars", (_, vars: unknown) => {
    const result = UpdateGlobalVarsSchema.safeParse(vars);
    if (result.success) globalVars = result.data as GlobalVariables;
  });

  ipcMain.on("test-sequence", (_, signal: unknown) => {
    const result = TestSequenceSchema.safeParse(signal);
    if (!result.success) return;
    executeSequence(result.data, true);
  });
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

/**
 * Triggers the execution of a workflow sequence based on an incoming signal string.
 * This function handles signal matching, application-specific priority, and debouncing.
 * @param incomingSignal The signal ID (e.g., 'BTN_1') or speed category ('RAPIDA').
 * @param isTest Whether this is a manual test trigger from the UI.
 */
export async function executeSequence(incomingSignal: string, isTest: boolean = false) {

  const win = getWindow();

  // 1. Gather all candidate workflows for this signal (unique by their key)
  let candidatesMap = new Map<string, SignalEntry>();
  
  if (signalMap[incomingSignal]) {
    candidatesMap.set(incomingSignal, signalMap[incomingSignal]);
  } 
  
  if (["RAPIDA", "MEDIA", "LENTA"].includes(incomingSignal)) {
    for (const key in signalMap) {
      const entry = signalMap[key];
      const speeds = Array.isArray(entry.assignedToButton)
        ? entry.assignedToButton
        : entry.assignedToButton ? [entry.assignedToButton] : [];
        
      if (speeds.includes(incomingSignal)) {
        candidatesMap.set(key, entry);
      }
    }
  }

  if (candidatesMap.size === 0) return;

  // 2. Find the best candidate based on focus priority
  let bestCandidate: { signal: string; entry: SignalEntry } | null = null;
  
  if (isTest) {
    const firstKey = candidatesMap.keys().next().value;
    if (firstKey) {
      bestCandidate = { signal: firstKey, entry: candidatesMap.get(firstKey)! };
    }
  } else {
    const focusedAppName = await getFocusedApp();
    log.debug(`[execution] Focused App: "${focusedAppName}" (Incoming: ${incomingSignal})`);

    let globalCandidate: { signal: string; entry: SignalEntry } | null = null;
    let partialMatchCandidate: { signal: string; entry: SignalEntry } | null = null;

    for (const [key, entry] of candidatesMap.entries()) {
      const assigned = entry.assignedApp;
      if (!assigned) {
        if (!globalCandidate) globalCandidate = { signal: key, entry };
      } else {
        const target = assigned.toLowerCase().endsWith(".exe") ? assigned.slice(0, -4) : assigned;
        const targetLower = target.toLowerCase();
        
        if (focusedAppName) {
          if (focusedAppName === targetLower) {
            bestCandidate = { signal: key, entry };
            break; 
          }
          if (focusedAppName.includes(targetLower)) {
            if (!partialMatchCandidate) partialMatchCandidate = { signal: key, entry };
          }
        }
      }
    }

    if (!bestCandidate) {
      bestCandidate = partialMatchCandidate || globalCandidate;
    }
  }

  if (!bestCandidate) {
    log.debug(`[execution] No matching workflow found for signal "${incomingSignal}" with focus.`);
    return;
  }

  const { signal, entry } = bestCandidate;

  if (runningSequences.has(signal)) {
    log.debug(`[execution] Skipping: "${signal}" is already running.`);
    return;
  }
  
  runningSequences.add(signal);
  log.info(`[execution] Running: "${signal}"`);

  if (!entry || !entry.steps?.length) {
    runningSequences.delete(signal);
    return;
  }

  if (win) win.webContents.send("sequence-start", signal);

  const context: ExecutionContext = {
    prevStepSuccess: true,
    variables: { ...globalVars },
  };

  let sequenceSuccess = true;
  try {
    sequenceSuccess = await executeStepsRecursive(entry.steps, context);
  } catch (err: any) {
    sequenceSuccess = false;
    log.error(`[execution] Error in "${signal}":`, err.message);
  } finally {
    log.info(`[execution] Completed: "${signal}"`);
    if (win) win.webContents.send("sequence-end", { signal, success: sequenceSuccess });
    runningSequences.delete(signal);
  }
}

/**
 * Recursively executes an array of steps within a given context.
 * @param steps Array of steps to execute.
 * @param context Current execution context.
 * @returns Promise resolving to true if all steps succeeded, false otherwise.
 */
async function executeStepsRecursive(steps: Step[], context: ExecutionContext): Promise<boolean> {
  const win = getWindow();
  let allOk = true;
  for (const step of steps) {
    try {
      await executeStep(step, context);
      context.prevStepSuccess = true;
    } catch (e: any) {
      context.prevStepSuccess = false;
      allOk = false;
      if (win)
        win.webContents.send("serial-error", `[${step.type}] ${e.message}`);
    }
  }
  return allOk;
}

/**
 * Helper to unwrap VariableInfo or return the raw value.
 */
function getVarValue(v: any): any {
  if (v !== null && typeof v === "object" && "value" in v && "type" in v) {
    return v.value;
  }
  return v;
}

/**
 * Updates a variable in the context, preserving the VariableInfo wrapper if present.
 */
function setVar(context: ExecutionContext, name: string, value: any): void {
  const existing = context.variables[name];
  if (existing !== null && existing !== undefined && typeof existing === "object" && "value" in existing && "type" in existing) {
    context.variables[name] = { ...existing, value };
  } else {
    context.variables[name] = value;
  }
}

/**
 * Resolves a value by interpolating variables (e.g., "$my_var") from the execution context.
 * Supports exact variable matching, string interpolation, and special escape sequences like \n and \s.
 * @param val The raw value or string template.
 * @param context Current execution context.
 */
function resolveValue(val: any, context: ExecutionContext): any {
  if (typeof val !== "string") return val;

  // Caso 1: Coincidencia exacta (sin espacios alrededor para preservar tipos crudos)
  if (val.startsWith("$") && !val.includes(" ")) {
    const varName = val.substring(1);
    if (context.variables[varName] !== undefined) {
      return getVarValue(context.variables[varName]);
    }
  }

  // Caso 2: Interpolación y secuencias de escape
  let result = val.replace(
    /\$([a-zA-Z0-9_]+)/g,
    (match, name, offset, wholeString) => {
      if (context.variables[name] !== undefined) {
        const v = getVarValue(context.variables[name]);
        if (Array.isArray(v)) return JSON.stringify(v);
        if (typeof v === "string") {
          const before = wholeString[offset - 1];
          const after = wholeString[offset + match.length];
          const isQuoted =
            (before === '"' || before === "'") &&
            (after === '"' || after === "'");
          return isQuoted ? v : JSON.stringify(v);
        }
        return String(v);
      }
      return match;
    },
  );

  // Soporte para \s (espacio) y \n (nueva línea)
  return result.replace(/\\s/g, " ").replace(/\\n/g, "\n");
}

/**
 * Executes a single workflow step.
 * Dispatches built-in actions or routes to the plugin engine for custom block types.
 * @param step The step definition to execute.
 * @param context Current execution context.
 */
export async function executeStep(step: Step, context: ExecutionContext) {

  const win = getWindow();
  const p = step.params || {};

  switch (step.type) {
    case "screenshot": {
      const filename = resolveValue(p.filename, context);
      await takeScreenshot(filename);
      break;
    }
    case "screenshot_region": {
      const filename = resolveValue(p.filename, context);
      let x: number, y: number, w: number, h: number;

      if (promptForRegionFn) {
        const rect = await promptForRegionFn();
        if (!rect) throw new Error("Selección de región cancelada");
        x = rect.x;
        y = rect.y;
        w = rect.width;
        h = rect.height;
      } else {
        // Fallback for safety, although promptForRegionFn should be present
        x = parseInt(resolveValue(p.x, context)) || 0;
        y = parseInt(resolveValue(p.y, context)) || 0;
        w = parseInt(resolveValue(p.w, context)) || 400;
        h = parseInt(resolveValue(p.h, context)) || 300;
      }

      await takeScreenshotRegion(filename, x, y, w, h);
      break;
    }
    case "keypress":
      await simulateKey(resolveValue(p.combo, context) || "");
      break;
    case "wait":
      await sleep(parseInt(resolveValue(p.ms, context)) || 100);
      break;
    case "clipboard": {
      const txt = resolveValue(p.text, context);
      clipboard.writeText(txt !== undefined ? String(txt) : "");
      break;
    }
    case "media":
      await mediaControl(p.action || "");
      break;
    case "open_url": {
      let targetUrl = String(resolveValue(p.url, context) || "");
      if (targetUrl && !/^https?:\/\//i.test(targetUrl))
        targetUrl = "https://" + targetUrl;
      try {
        const parsed = new URL(targetUrl);
        if (!["http:", "https:"].includes(parsed.protocol)) {
          throw new Error(`Protocolo no permitido: ${parsed.protocol}`);
        }
        await shell.openExternal(parsed.href);
      } catch (e: any) {
        throw new Error(`URL inválida: ${e.message}`);
      }
      break;
    }
    case "run_cmd":
      await runCmd(String(resolveValue(p.cmd, context) || ""));
      break;
    case "open_file":
    case "open_app": {
      const filePath = String(resolveValue(p.path, context) || "");
      if (!filePath) throw new Error("Ruta vacía");
      const error = await shell.openPath(filePath);
      if (error) throw new Error(error);
      break;
    }
    case "notify": {
      const title = String(resolveValue(p.title, context) || "Arduino");
      const body = String(resolveValue(p.body, context) || "");
      if (Notification.isSupported()) new Notification({ title, body }).show();
      if (win) win.webContents.send("show-notification", { title, body });
      break;
    }
    case "set_variable": {
      let name = String(p.name || "").trim();
      if (name.startsWith("$")) name = name.substring(1);
      if (!name) throw new Error("Nombre de variable vacío");
      const type = p.type || "string";
      let val = p.value;
      if (type === "int") val = parseInt(val) || 0;
      else if (type === "float") val = parseFloat(val) || 0.0;
      else if (type === "bool") val = val === "true" || val === true || val === 1;
      else if (type === "list") {
        try {
          val = typeof val === "string" ? JSON.parse(val) : val;
          if (!Array.isArray(val)) val = [];
        } catch (e) {
          val = [];
        }
      } else if (type === "json") {
        try { val = typeof val === "string" ? JSON.parse(val) : val; } catch {}
      }
      context.variables[name] = { value: val, type };
      log.debug(`[execution] Variable set: ${name} (${type}) =`, val);
      break;
    }
    case "modify_variable": {
      let name = String(p.name || "").trim();
      if (name.startsWith("$")) name = name.substring(1);
      if (!name || context.variables[name] === undefined)
        throw new Error(`Variable "${name}" no encontrada`);
      const op = p.op;
      let val = resolveValue(p.value, context);
      const currentVal = getVarValue(context.variables[name]);

      if (op === "add") {
        setVar(context, name, (parseFloat(currentVal) || 0) + (parseFloat(val) || 0));
      } else if (op === "sub") {
        setVar(context, name, (parseFloat(currentVal) || 0) - (parseFloat(val) || 0));
      } else if (op === "set") {
        setVar(context, name, val);
      } else if (op === "concat") {
        const current = currentVal !== undefined && currentVal !== null ? String(currentVal) : "";
        const toAdd = val !== undefined && val !== null ? String(val) : "";
        setVar(context, name, current + toAdd);
      }
      log.debug(`[execution] Variable modified: ${name} (${op}) ->`, getVarValue(context.variables[name]));
      break;
    }
    case "list_operation": {
      let name = String(p.name || "").trim();
      if (name.startsWith("$")) name = name.substring(1);
      const list = getVarValue(context.variables[name]);
      if (!name || !Array.isArray(list))
        throw new Error(`Lista "${name}" no encontrada`);
      const op = p.op;
      const val = resolveValue(p.value, context);

      if (op === "append") list.push(val);
      else if (op === "pop") list.pop();
      else if (op === "clear") setVar(context, name, []);
      else if (op === "remove_at") {
        const idx = parseInt(val);
        if (!isNaN(idx)) list.splice(idx, 1);
      }
      break;
    }
    case "run_script": {
      const code = resolveValue(p.code || "", context);
      await runScript(p.lang || "python", code);
      break;
    }
    case "loop": {
      let iterations = 1;
      const innerSteps: Step[] = p.steps || [];

      if (p.mode === "foreach") {
        let list = resolveValue(p.list_name, context);

        if (!Array.isArray(list) && p.list_name) {
          let rawName = String(p.list_name).trim();
          if (rawName.startsWith("$")) rawName = rawName.substring(1);
          if (Array.isArray(context.variables[rawName])) {
            list = context.variables[rawName];
          }
        }

        // Auto-parse if it's a string representation of a list
        if (typeof list === "string" && list.trim().startsWith("[")) {
          try {
            const parsed = JSON.parse(list);
            if (Array.isArray(parsed)) list = parsed;
          } catch (e) {
            // Not a valid JSON array, keep as is
          }
        }

        if (Array.isArray(list)) {
          let varName = p.var_name || "item";
          if (varName.startsWith("$")) varName = varName.substring(1);

          const oldValue = context.variables[varName]; // Scope: save old value

          log.debug(`[execution] Starting loop foreach on list (length: ${list.length})`);
          try {
            for (const item of list) {
              context.variables[varName] = item;
              await executeStepsRecursive(innerSteps, context);
            }
          } finally {
            // Scope: restore or delete after loop finishes
            if (oldValue !== undefined) {
              context.variables[varName] = oldValue;
            } else {
              delete context.variables[varName];
            }
          }
        } else {
          log.warn("[execution] Foreach loop: list is not an array", list);
        }
        return; // Important to return here
      } else {
        iterations = parseInt(resolveValue(p.iterations, context)) || 1;
        for (let i = 0; i < iterations; i++) {
          await executeStepsRecursive(innerSteps, context);
        }
      }
      break;
    }
    case "condition": {
      const isTrue = await evaluateCondition(p, context);
      if (isTrue) {
        const innerSteps: Step[] = p.steps || [];
        await executeStepsRecursive(innerSteps, context);
      }
      break;
    }
    default:
      // If not a native block, try to execute as plugin
      await executePlugin(step.type, p, context);
      break;
  }
}

async function evaluateCondition(params: any, context: ExecutionContext): Promise<boolean> {
  const type = params.type || "prev_step_success";
  const expectedValue = resolveValue(params.value, context);

  switch (type) {
    case "prev_step_success":
      return context.prevStepSuccess;
    case "clipboard_match":
      const text = clipboard.readText();
      return text.includes(String(expectedValue));
    case "app_running":
      return await isAppRunning(String(expectedValue));
    case "var_cmp": {
      const v1: any = resolveValue(params.var1, context);
      const v2: any = resolveValue(params.var2, context);
      const op = params.op || "==";
      if (op === "==") return v1 == v2;
      if (op === "!=") return v1 != v2;
      if (op === ">") return v1 > v2;
      if (op === "<") return v1 < v2;
      if (op === "contains")
        return Array.isArray(v1)
          ? v1.includes(v2)
          : String(v1).includes(String(v2));
      return false;
    }
    default:
      return false;
  }
}

export async function getFocusedApp(): Promise<string | null> {
  const plat = process.platform;

  if (plat === "win32") {
    return new Promise((resolve) => {
      const psScript = [
        "if (-not ([System.Management.Automation.PSTypeName]'PokepadFocus.Win32').Type) {",
        "  Add-Type -MemberDefinition '[DllImport(\"user32.dll\")] public static extern IntPtr GetForegroundWindow(); [DllImport(\"user32.dll\")] public static extern int GetWindowThreadProcessId(IntPtr h, out int p);' -Name Win32 -Namespace PokepadFocus",
        "}",
        "$hwnd = [PokepadFocus.Win32]::GetForegroundWindow();",
        "$p = 0;",
        "[PokepadFocus.Win32]::GetWindowThreadProcessId($hwnd, [ref]$p) | Out-Null;",
        "if ($p -gt 0) { (Get-Process -Id $p -ErrorAction SilentlyContinue).Name }",
      ].join(" ");
      execFile("powershell", ["-NoProfile", "-NonInteractive", "-Command", psScript], { timeout: 3000 }, (err, stdout) => {
        resolve(stdout ? stdout.trim().toLowerCase() : null);
      });
    });
  }

  // On macOS/Linux use nut-js (window title works well for app matching there)
  try {
    const { getActiveWindow } = require("@nut-tree-fork/nut-js");
    const activeWin = await Promise.race([
      getActiveWindow(),
      new Promise<any>((_, reject) => setTimeout(() => reject(new Error("Timeout")), 2000))
    ]);
    const title = await activeWin.title;
    if (title && title.trim().length > 0) return title.toLowerCase();
  } catch (e: any) {
    log.warn("[execution] nut-js focus detection failed or timed out:", e.message);
  }

  if (plat === "darwin") {
    return new Promise((resolve) => {
      exec("osascript -e 'tell application \"System Events\" to get name of first process whose frontmost is true'", (err, stdout) => {
        resolve(stdout ? stdout.trim().toLowerCase() : null);
      });
    });
  }

  // Linux fallback (requires xdotool)
  return new Promise((resolve) => {
    exec("xdotool getactivewindow getwindowpid", (err, pid) => {
      if (err || !pid) return resolve(null);
      exec(`ps -p ${pid.trim()} -o comm=`, (err2, stdout2) => {
        resolve(stdout2 ? stdout2.trim().toLowerCase() : null);
      });
    });
  });
}

export function isAppRunning(appName: string): Promise<boolean> {
  return new Promise((resolve) => {
    const plat = process.platform;
    
    if (plat === "win32") {
      const processName = appName.toLowerCase().endsWith(".exe") 
        ? appName.slice(0, -4) 
        : appName;
      
      const psCommand = `Get-Process -Name "${processName}" -ErrorAction SilentlyContinue`;
      execFile("powershell", ["-NoProfile", "-NonInteractive", "-Command", psCommand], (err, stdout) => {
        if (stdout && stdout.trim().length > 0) {
          resolve(true);
        } else {
          exec(`tasklist /NH /FI "IMAGENAME eq ${appName}"`, (err2, stdout2) => {
            resolve(!!(stdout2 && stdout2.toLowerCase().includes(appName.toLowerCase())));
          });
        }
      });
    } else {
      const cmd = "ps -ax";
      exec(cmd, { maxBuffer: 1024 * 1024 }, (err, stdout) => {
        if (err) {
          log.error(`[execution] Error checking app "${appName}":`, err.message);
          resolve(false);
          return;
        }
        resolve(stdout.toLowerCase().includes(appName.toLowerCase()));
      });
    }
  });
}

export function runCmd(cmd: string): Promise<void> {
  const win = getWindow();
  if (cmd.length > MAX_CMD_LENGTH) {
    if (win) {
      win.webContents.send("action-result", {
        cmd,
        ok: false,
        output: `Comando demasiado largo (máx ${MAX_CMD_LENGTH} chars)`,
      });
    }
    return Promise.resolve();
  }

  return new Promise((resolve, reject) =>
    exec(cmd, { timeout: 30000 }, (err, stdout) => {
      if (win) {
        win.webContents.send("action-result", {
          cmd,
          ok: !err,
          output: err ? err.message : stdout,
        });
      }
      if (err) reject(err);
      else resolve();
    }),
  );
}

export function runScript(lang: string, code: string): Promise<void> {
  const win = getWindow();
  const allowedLangs: Record<string, string> = { python: ".py", javascript: ".js" };
  const ext = allowedLangs[lang];
  if (!ext) {
    if (win) {
      win.webContents.send("action-result", {
        cmd: `[Script ${lang}]`,
        ok: false,
        output: `Lenguaje no soportado: ${lang}`,
      });
    }
    return Promise.resolve();
  }

  const interpreter = lang === "javascript" ? "node" : "python";
  const tmpFile = path.join(SCRIPT_DIR, `script_${Date.now()}${ext}`);

  try {
    fs.writeFileSync(tmpFile, code, { encoding: "utf-8", mode: 0o600 });
  } catch (writeErr: any) {
    if (win) {
      win.webContents.send("action-result", {
        cmd: `[Script ${lang}]`,
        ok: false,
        output: `Error escribiendo script: ${writeErr.message}`,
      });
    }
    return Promise.resolve();
  }

  return new Promise((resolve, reject) =>
    execFile(
      interpreter,
      [tmpFile],
      { timeout: 30000 },
      (err, stdout, stderr) => {
        try {
          fs.unlinkSync(tmpFile);
        } catch (_) {}

        const output = (stdout || "") + (stderr || "");
        if (win) {
          win.webContents.send("action-result", {
            cmd: `[Script ${lang}]`,
            ok: !err,
            output: err
              ? err.killed
                ? "Script timed out (30s)"
                : output || err.message
              : output,
          });
        }
        if (err) reject(err);
        else resolve();
      },
    ),
  );
}

export function setSignalMap(map: SignalMap) {
  signalMap = map;
}

export function takeScreenshot(fileName: string): Promise<string> {
  const picturesDir = path.join(os.homedir(), "Pictures", "MacroPad");
  if (!fs.existsSync(picturesDir)) {
    try {
      fs.mkdirSync(picturesDir, { recursive: true });
    } catch (_) {}
  }
  const name = fileName || `screenshot_${Date.now()}.png`;
  const fullPath = path.join(picturesDir, name);
  const platform = process.platform;

  return new Promise((resolve, reject) => {
    if (platform === "win32") {
      const psScript = `
        Add-Type -AssemblyName System.Windows.Forms, System.Drawing;
        $screens = [System.Windows.Forms.Screen]::AllScreens;
        $left = 0; $top = 0; $right = 0; $bottom = 0;
        foreach ($s in $screens) {
          if ($s.Bounds.X -lt $left) { $left = $s.Bounds.X }
          if ($s.Bounds.Y -lt $top) { $top = $s.Bounds.Y }
          if ($s.Bounds.Right -gt $right) { $right = $s.Bounds.Right }
          if ($s.Bounds.Bottom -gt $bottom) { $bottom = $s.Bounds.Bottom }
        }
        $width = $right - $left;
        $height = $bottom - $top;
        $bmp = New-Object System.Drawing.Bitmap($width, $height);
        $g = [System.Drawing.Graphics]::FromImage($bmp);
        $g.CopyFromScreen($left, $top, 0, 0, $bmp.Size);
        $bmp.Save('${fullPath.replace(/'/g, "''")}', [System.Drawing.Imaging.ImageFormat]::Png);
        $g.Dispose();
        $bmp.Dispose();
      `.replace(/\n/g, " ");
      execFile("powershell", ["-NoProfile", "-NonInteractive", "-Command", psScript], (err) => {
        if (err) reject(err);
        else resolve(fullPath);
      });
    } else if (platform === "darwin") {
      exec(`screencapture -x "${fullPath}"`, (err) => {
        if (err) reject(err);
        else resolve(fullPath);
      });
    } else {
      exec(`gnome-screenshot -f "${fullPath}" || scrot "${fullPath}"`, (err) => {
        if (err) reject(err);
        else resolve(fullPath);
      });
    }
  });
}

export function takeScreenshotRegion(fileName: string, x: number, y: number, w: number, h: number): Promise<string> {
  const picturesDir = path.join(os.homedir(), "Pictures", "MacroPad");
  if (!fs.existsSync(picturesDir)) {
    try {
      fs.mkdirSync(picturesDir, { recursive: true });
    } catch (_) {}
  }
  const name = fileName || `region_${Date.now()}.png`;
  const fullPath = path.join(picturesDir, name);
  const platform = process.platform;

  return new Promise((resolve, reject) => {
    if (platform === "win32") {
      const psScript = `
        Add-Type -AssemblyName System.Windows.Forms, System.Drawing;
        $bmp = New-Object System.Drawing.Bitmap(${w}, ${h});
        $g = [System.Drawing.Graphics]::FromImage($bmp);
        $g.CopyFromScreen(${x}, ${y}, 0, 0, $bmp.Size);
        $bmp.Save('${fullPath.replace(/'/g, "''")}', [System.Drawing.Imaging.ImageFormat]::Png);
        $g.Dispose();
        $bmp.Dispose();
      `.replace(/\n/g, " ");
      execFile(
        "powershell",
        ["-NoProfile", "-NonInteractive", "-Command", psScript],
        (err) => {
          if (err) reject(err);
          else resolve(fullPath);
        },
      );
    } else if (platform === "darwin") {
      exec(`screencapture -R${x},${y},${w},${h} -x "${fullPath}"`, (err) => {
        if (err) reject(err);
        else resolve(fullPath);
      });
    } else {
      exec(`scrot -a ${x},${y},${w},${h} "${fullPath}"`, (err) => {
        if (err) reject(err);
        else resolve(fullPath);
      });
    }
  });
}
