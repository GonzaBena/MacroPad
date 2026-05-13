import { AppState, Step, StepType, AppConfig, GlobalVariables, SignalMap } from '../../src/types/pokepad';

export interface StepTypeInfo {
  label: string;
  icon: string;
  cls: string;
  isContainer?: boolean;
}

export const STEP_TYPES: Record<StepType, StepTypeInfo> = {
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

export const state: AppState & {
  dragSrcPath: string | null;
  dragSrcWorkflow: string | null;
  dragSrcFolder: string | null;
  capturingPath: string | null;
  selectingRegionPath: string | null;
  runningApps: any[];
  history: any[];
  insertionPoint: { path: number[]; index: number } | null;
} = {
  connected: false,
  signals: {},
  folders: [],
  selectedSig: null,
  selectedFolder: "all",
  globalVariables: {},
  logAll: [],
  stats: { sig: 0, act: 0, err: 0, success: 0, failure: 0 },
  config: {
    theme: "dark-default",
    closeBehavior: "tray",
    accentColor: "#f59e0b",
    startupMode: "normal",
    enableZoom: true,
    zoomLevel: 1.0,
    sidebarCollapsed: false,
    initialTab: "workflows",
    activeSidebarSection: "serial",
    workflowSort: "original"
  },
  dragSrcPath: null,
  dragSrcWorkflow: null,
  dragSrcFolder: null,
  capturingPath: null,
  selectingRegionPath: null,
  runningApps: [],
  history: [],
  insertionPoint: null
};

// Undo / Redo stacks
const undoStack: SignalMap[] = [];
const redoStack: SignalMap[] = [];
const MAX_UNDO = 30;

export function pushUndo(): void {
  undoStack.push(JSON.parse(JSON.stringify(state.signals)));
  if (undoStack.length > MAX_UNDO) undoStack.shift();
  redoStack.length = 0; // Clear redo on new action
}

export function undo(): boolean {
  if (!undoStack.length) return false;
  redoStack.push(JSON.parse(JSON.stringify(state.signals)));
  state.signals = undoStack.pop()!;
  saveSignals();
  return true;
}

export function redo(): boolean {
  if (!redoStack.length) return false;
  undoStack.push(JSON.parse(JSON.stringify(state.signals)));
  state.signals = redoStack.pop()!;
  saveSignals();
  return true;
}

export function canUndo(): boolean { return undoStack.length > 0; }
export function canRedo(): boolean { return redoStack.length > 0; }

export function uid(): string {
  return Math.random().toString(36).slice(2, 9);
}

function getPersistableState() {
  return {
    signals: state.signals,
    folders: state.folders,
    globalVariables: state.globalVariables,
    stats: state.stats,
    history: state.history || [],
    config: state.config
  };
}

export function pushSignals(): void {
  window.arduino.updateSignals(state.signals);
  window.arduino.updateGlobalVars(state.globalVariables);
}

export function saveSignals(): void {
  window.arduino.saveData(getPersistableState());
  localStorage.setItem("ac-signals", JSON.stringify(state.signals));
  localStorage.setItem("ac-folders", JSON.stringify(state.folders));
  pushSignals();
  document.dispatchEvent(new CustomEvent("data-saved"));
}

export function saveConfig(): void {
  localStorage.setItem("ac-config", JSON.stringify(state.config));
  window.arduino.saveData(getPersistableState());
  applyConfig();
}

export async function applyConfig(): Promise<void> {
  const root = document.documentElement;
  const accent = state.config.accentColor || "#f59e0b";
  root.style.setProperty("--amber", accent);
  root.style.setProperty("--amber-dim", `color-mix(in srgb, ${accent} 70%, black)`);
  root.style.setProperty("--amber-bg", `color-mix(in srgb, ${accent} 10%, transparent)`);

  // Apply theme
  const themeId = state.config.theme || "dark-default";
  let themeData = await window.arduino.getThemeData(themeId);

  if (!themeData) {
    const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
    const fallbackId = prefersDark ? "dark-default" : "light-default";
    themeData = await window.arduino.getThemeData(fallbackId);
    if (themeData) {
      state.config.theme = fallbackId;
      window.arduino.saveData(getPersistableState());
    }
  }

  if (themeData && themeData.colors) {
    Object.entries(themeData.colors).forEach(([key, value]) => {
      root.style.setProperty(key, value as string);
    });
  }

  // Apply zoom
  if (state.config.enableZoom) {
    window.arduino.setZoomFactor(state.config.zoomLevel || 1.0);
  } else {
    window.arduino.setZoomFactor(1.0);
  }

  // Sidebar state
  const appBody = document.getElementById("app-body");
  if (appBody) {
    appBody.classList.toggle("sidebar-collapsed", !!state.config.sidebarCollapsed);
  }

  const content = document.getElementById("main-content");

  const section = state.config.activeSidebarSection || "serial";
  document.getElementById("ab-btn-serial")?.classList.toggle("active", !state.config.sidebarCollapsed && section === "serial");
  document.getElementById("ab-btn-global-vars")?.classList.toggle("active", !state.config.sidebarCollapsed && section === "global-vars");
  document.getElementById("section-serial")?.classList.toggle("d-none", section !== "serial");
  document.getElementById("section-global-vars")?.classList.toggle("d-none", section !== "global-vars");
}

export async function loadConfig(): Promise<void> {
  try {
    const fileData = await window.arduino.loadData();
    if (fileData && fileData.config) {
      state.config = { ...state.config, ...fileData.config };
    }
  } catch (e) {
    console.error(e);
  }
  try {
    const c = localStorage.getItem("ac-config");
    if (c) state.config = { ...state.config, ...JSON.parse(c) };
  } catch (e) {}
  await applyConfig();
}

export function selectSidebarSection(section: string): void {
  state.config.activeSidebarSection = section;
  applyConfig();
}

function migrateType(t: string): StepType {
  const map: Record<string, StepType> = {
    open_url: "open_url",
    run_command: "run_cmd",
    open_file: "open_file",
    open_folder: "open_file",
    notification: "notify",
  };
  return map[t] || "notify";
}

function migrateParams(t: string, v: any): Record<string, any> {
  if (t === "open_url") return { url: v };
  if (t === "run_command") return { cmd: v };
  if (t === "open_file") return { path: v };
  if (t === "open_folder") return { path: v };
  if (t === "notification") return { title: "Arduino", body: v };
  return {};
}

/**
 * Load signals: try file-based persistence first, fall back to localStorage.
 */
export async function loadSignalsData(): Promise<void> {
  let fileData: any = null;
  try {
    fileData = await window.arduino.loadData();
    if (fileData) {
      if (fileData.signals) state.signals = fileData.signals;
      if (fileData.folders) state.folders = fileData.folders;
      if (fileData.globalVariables) state.globalVariables = fileData.globalVariables;
      if (fileData.stats) state.stats = { ...state.stats, ...fileData.stats };
      if (fileData.history) state.history = fileData.history;
      
      if (fileData.config) {
        state.config = { ...state.config, ...fileData.config };
        applyConfig();
      }
      
      console.log("[state] Loaded data from file persistence");
      
      // If we have data in file, we might still want to check if there's something to migrate
      // but usually file persistence is the primary source once it exists.
      if (Object.keys(state.signals).length > 0 || Object.keys(state.globalVariables).length > 0) {
         pushSignals();
         return;
      }
    }
  } catch (e) {
    console.warn("[state] File persistence error, falling back to localStorage", e);
  }

  // Migration / Fallback from localStorage
  try {
    const localSignals = localStorage.getItem("ac-signals");
    const localFolders = localStorage.getItem("ac-folders");
    const localVars = localStorage.getItem("ac-vars");

    if (localVars) {
      state.globalVariables = JSON.parse(localVars);
      console.log("[state] Migrated variables from localStorage");
    }

    if (localFolders) {
      const parsed = JSON.parse(localFolders);
      if (Array.isArray(parsed)) state.folders = parsed;
    }

    if (localSignals) {
      const parsed = JSON.parse(localSignals);
      Object.entries(parsed).forEach(([sig, val]: [string, any]) => {
        if (!val.steps) {
          state.signals[sig] = {
            label: val.label || "",
            color: val.color || SIG_COLORS[Object.keys(state.signals).length % SIG_COLORS.length],
            steps: val.type && val.type !== "none"
              ? [{ id: uid(), type: migrateType(val.type), params: migrateParams(val.type, val.value) }]
              : [],
            assignedToButton: Array.isArray(val.assignedToButton)
              ? val.assignedToButton.filter((s: string) => ["RAPIDA", "MEDIA", "LENTA"].includes(s))
              : (function () {
                  if (val.assignedToButton === true) return ["RAPIDA"];
                  if (["RAPIDA", "MEDIA", "LENTA"].includes(val.assignedToButton)) return [val.assignedToButton];
                  return [];
                })(),
            assignedApp: null,
          };
        } else {
          state.signals[sig] = val;
        }
      });
      console.log("[state] Migrated signals from localStorage");
    }

    if (localSignals || localVars || localFolders) {
      window.arduino.saveData(getPersistableState());
    }
  } catch (e) {
    console.error("[state] Error migrating from localStorage:", e);
  }

  pushSignals();
}
