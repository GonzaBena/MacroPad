export const state = {
  connected: false,
  signals: {},
  selectedSig: null,
  logAll: [],
  stats: { sig: 0, act: 0, err: 0 },
  dragSrcPath: null,
  capturingPath: null,
  selectingRegionPath: null,
  config: {
    theme: "dark",
    closeBehavior: "close",
    accentColor: "#f5a623",
    initialTab: "monitor",
    startupMode: "none",
    enableZoom: true,
    zoomLevel: 1.0,
  },
};

// ── Undo / Redo ──
const undoStack = [];
const redoStack = [];
const MAX_UNDO = 30;

/**
 * Push a snapshot of signals to the undo stack.
 * Call this BEFORE making a change.
 */
export function pushUndo() {
  undoStack.push(JSON.parse(JSON.stringify(state.signals)));
  if (undoStack.length > MAX_UNDO) undoStack.shift();
  redoStack.length = 0; // Clear redo on new action
}

export function undo() {
  if (!undoStack.length) return false;
  redoStack.push(JSON.parse(JSON.stringify(state.signals)));
  state.signals = undoStack.pop();
  saveSignals();
  return true;
}

export function redo() {
  if (!redoStack.length) return false;
  undoStack.push(JSON.parse(JSON.stringify(state.signals)));
  state.signals = redoStack.pop();
  saveSignals();
  return true;
}

export function canUndo() {
  return undoStack.length > 0;
}
export function canRedo() {
  return redoStack.length > 0;
}

// ── Constants ──

export const STEP_TYPES = {
  keypress: { label: "Simular tecla", icon: "⌨", cls: "t-keypress" },
  wait: { label: "Esperar", icon: "◷", cls: "t-wait" },
  clipboard: { label: "Copiar texto", icon: "⎘", cls: "t-clipboard" },
  media: { label: "Media", icon: "▶", cls: "t-media" },
  open_url: { label: "Abrir URL", icon: "↗", cls: "t-open_url" },
  run_cmd: { label: "Ejecutar cmd", icon: "$", cls: "t-run_cmd" },
  open_file: { label: "Abrir archivo", icon: "⌂", cls: "t-open_file" },
  open_app: { label: "Abrir aplicación", icon: "🚀", cls: "t-open_app" },
  set_variable: { label: "Definir variable", icon: "📦", cls: "t-var" },
  modify_variable: { label: "Modificar variable", icon: "⚙", cls: "t-var" },
  list_operation: { label: "Operación de lista", icon: "▤", cls: "t-var" },
  loop: {
    label: "Bucle (Repetir)",
    icon: "🔄",
    cls: "t-loop",
    isContainer: true,
  },
  condition: {
    label: "Condicional (Si...)",
    icon: "❓",
    cls: "t-condition",
    isContainer: true,
  },
  notify: { label: "Notificación", icon: "◉", cls: "t-notify" },
  run_script: { label: "Ejecutar script", icon: "{ }", cls: "t-run_script" },
  screenshot: { label: "Captura de pantalla", icon: "📸", cls: "t-screenshot" },
  screenshot_region: { label: "Captura de región", icon: "✂️", cls: "t-screenshot" },
  note: { label: "Nota / Comentario", icon: "📝", cls: "t-note" },
};

export const MEDIA_OPTIONS = [
  { value: "play_pause", label: "Play / Pause" },
  { value: "next", label: "Siguiente" },
  { value: "prev", label: "Anterior" },
  { value: "vol_up", label: "Subir volumen" },
  { value: "vol_down", label: "Bajar volumen" },
  { value: "mute", label: "Mute" },
];

export const SIG_COLORS = [
  "#f5a623",
  "#3ddc84",
  "#5b8ef0",
  "#a78bfa",
  "#f472b6",
  "#2dd4bf",
  "#fb923c",
  "#ff4d6a",
];

export function pushSignals() {
  window.arduino.updateSignals(state.signals);
}

export function saveSignals() {
  // Save to file via main process
  window.arduino.saveData({
    signals: state.signals,
    config: state.config,
  });
  // Also keep localStorage as quick fallback
  localStorage.setItem("ac-signals", JSON.stringify(state.signals));
  pushSignals();
}

export async function applyConfig() {
  // Apply accent color using hex
  const root = document.documentElement;
  root.style.setProperty("--amber", state.config.accentColor);
  root.style.setProperty(
    "--amber-dim",
    `color-mix(in srgb, ${state.config.accentColor} 70%, black)`,
  );
  root.style.setProperty(
    "--amber-bg",
    `color-mix(in srgb, ${state.config.accentColor} 10%, transparent)`,
  );

  // Apply theme
  const themeId = state.config.theme || "dark-default";
  const themeData = await window.arduino.getThemeData(themeId);
  if (themeData && themeData.colors) {
    for (const [key, value] of Object.entries(themeData.colors)) {
      root.style.setProperty(key, value);
    }
  }

  // Apply zoom
  if (state.config.enableZoom) {
    window.arduino.setZoomFactor(state.config.zoomLevel || 1.0);
  } else {
    window.arduino.setZoomFactor(1.0);
  }
}

export async function loadConfig() {
  try {
    // Priority: File-based persistence
    const fileData = await window.arduino.loadData();
    if (fileData && fileData.config) {
      state.config = { ...state.config, ...fileData.config };
    } else {
      // Fallback: localStorage
      const c = localStorage.getItem("ac-config");
      if (c) {
        state.config = { ...state.config, ...JSON.parse(c) };
      }
    }
  } catch (e) {
    console.error(e);
  }
  await applyConfig();
}

export async function saveConfig() {
  localStorage.setItem("ac-config", JSON.stringify(state.config));
  // Also save to file
  await window.arduino.saveData({
    signals: state.signals,
    config: state.config,
  });
  await applyConfig();
}

function migrateType(t) {
  return (
    {
      open_url: "open_url",
      run_command: "run_cmd",
      open_file: "open_file",
      open_folder: "open_file",
      notification: "notify",
    }[t] || "notify"
  );
}

function migrateParams(t, v) {
  if (t === "open_url") return { url: v };
  if (t === "run_command") return { cmd: v };
  if (t === "open_file") return { path: v };
  if (t === "open_folder") return { path: v };
  if (t === "notification") return { title: "Arduino", body: v };
  return {};
}

export function uid() {
  return Math.random().toString(36).slice(2, 9);
}

/**
 * Load signals: try file-based persistence first, fall back to localStorage.
 */
export async function loadSignalsData() {
  try {
    // Try loading from file first
    const fileData = await window.arduino.loadData();
    if (
      fileData &&
      fileData.signals &&
      Object.keys(fileData.signals).length > 0
    ) {
      state.signals = fileData.signals;
      if (fileData.config) {
        state.config = { ...state.config, ...fileData.config };
        applyConfig();
      }
      console.log("[state] Loaded data from file persistence");
      pushSignals();
      return;
    }
  } catch (e) {
    console.warn(
      "[state] File persistence not available, falling back to localStorage",
      e,
    );
  }

  // Fallback to localStorage (migration path)
  try {
    const s = localStorage.getItem("ac-signals");
    if (s) {
      const parsed = JSON.parse(s);
      Object.entries(parsed).forEach(([sig, val]) => {
        if (!val.steps) {
          state.signals[sig] = {
            label: val.label || "",
            color:
              val.color ||
              SIG_COLORS[Object.keys(state.signals).length % SIG_COLORS.length],
            steps:
              val.type && val.type !== "none"
                ? [
                    {
                      id: uid(),
                      type: migrateType(val.type),
                      params: migrateParams(val.type, val.value),
                    },
                  ]
                : [],
            assignedToButton: Array.isArray(val.assignedToButton)
              ? val.assignedToButton.filter((s) =>
                  ["RAPIDA", "MEDIA", "LENTA"].includes(s),
                )
              : (function () {
                  if (val.assignedToButton === true) return ["RAPIDA"];
                  if (
                    ["RAPIDA", "MEDIA", "LENTA"].includes(val.assignedToButton)
                  )
                    return [val.assignedToButton];
                  return [];
                })(),
          };
        } else {
          state.signals[sig] = val;
        }
      });

      // Migrate localStorage data to file persistence
      console.log("[state] Migrating localStorage data to file persistence");
      window.arduino.saveData({
        signals: state.signals,
        config: state.config,
      });
    }
  } catch (e) {
    console.error(e);
  }
  pushSignals();
}
