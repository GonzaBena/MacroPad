import { AppState, Step, StepType, AppConfig, GlobalVariables, SignalMap } from '../../src/types/pokepad';
import { blockRegistry } from './registry/block-registry.js';
import { registerCoreBlocks } from './blocks/core-blocks.js';

// Inicializar bloques core
registerCoreBlocks();

export interface StepTypeInfo {
  label: string;
  icon: string;
  cls: string;
  isContainer?: boolean;
}

export const STEP_TYPES: Record<string, StepTypeInfo> = blockRegistry.getStepTypesConfig() as any;

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
  pluginManifests: Record<string, any>;
  insertionPoint: { path: number[]; index: number } | null;
  hardwareExclusiveMode: boolean;
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
  pluginManifests: {},
  insertionPoint: null,
  hardwareExclusiveMode: false,
};

export async function loadPlugins(incoming?: any[]): Promise<void> {
  try {
    const plugins = incoming ?? await window.arduino.getPlugins();

    // Remove stale plugin entries from STEP_TYPES and pluginManifests
    Object.keys(state.pluginManifests).forEach((id) => {
      if ((STEP_TYPES as any)[id]) delete (STEP_TYPES as any)[id];
    });
    state.pluginManifests = {};

    plugins.forEach((plugin: any) => {
      STEP_TYPES[plugin.id as StepType] = {
        label: plugin.name,
        icon: plugin.icon || "🧩",
        cls: "t-plugin",
      };
      state.pluginManifests[plugin.id] = plugin;
    });
    console.log(`[state] Loaded ${plugins.length} custom plugins`);
  } catch (e) {
    console.error("[state] Error loading plugins:", e);
  }
}

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
  localStorage.setItem("ac-vars", JSON.stringify(state.globalVariables));
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
  const content = document.getElementById("main-content");
  if (content) {
    content.classList.toggle("sidebar-hidden", !!state.config.sidebarCollapsed);
  }

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

      // If file has no global variables but localStorage has a backup, recover from it
      if (Object.keys(state.globalVariables).length === 0) {
        try {
          const localVars = localStorage.getItem("ac-vars");
          if (localVars) {
            const parsed = JSON.parse(localVars);
            if (parsed && typeof parsed === "object" && !Array.isArray(parsed) && Object.keys(parsed).length > 0) {
              state.globalVariables = parsed;
              console.log("[state] Recovered global variables from localStorage backup");
            }
          }
        } catch (_) {}
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
