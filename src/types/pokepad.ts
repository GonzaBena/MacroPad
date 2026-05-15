/**
 * Core types for PokePad
 */

/**
 * All valid step types that can be part of a workflow.
 * Core types are built-in, while string & {} allows for custom plugin-provided step types.
 */
export type StepType = 
  | 'keypress'
  | 'wait'
  | 'clipboard'
  | 'media'
  | 'open_url'
  | 'run_cmd'
  | 'open_file'
  | 'open_app'
  | 'set_variable'
  | 'modify_variable'
  | 'list_operation'
  | 'loop'
  | 'condition'
  | 'notify'
  | 'run_script'
  | 'screenshot'
  | 'screenshot_region'
  | 'note'
  | (string & {});

/**
 * Definition of a parameter for a plugin's background block.
 * These are used to automatically generate the UI in the workflow editor.
 */
export interface PluginParamSchema {
  /** Internal ID of the parameter */
  name: string;
  /** Label displayed in the UI */
  label: string;
  /** Type of input to render */
  type: 'string' | 'number' | 'select' | 'boolean';
  /** Optional placeholder text */
  placeholder?: string;
  /** Default value for the parameter */
  default?: any;
  /** Whether the parameter must be filled */
  required?: boolean;
  /** Options for 'select' type parameters */
  options?: { label: string; value: any }[];
}

/**
 * Metadata and configuration for a PokePad plugin.
 * Defined in the manifest.json file of each plugin.
 */
export interface PluginManifest {
  /** Unique identifier for the plugin (e.g., 'com.example.myplugin') */
  id: string;
  /** Human-readable name */
  name: string;
  /** Brief description of what the plugin does */
  description?: string;
  /** Semantic version string */
  version: string;
  /** Author name or handle */
  author?: string;
  /** Emoji or icon path for the plugin */
  icon: string;
  /** Branding color for the UI (optional) */
  color?: string;
  /** Parameters schema for custom workflow blocks provided by this plugin */
  params: PluginParamSchema[];
  /** Absolute path to the plugin folder (injected at runtime) */
  path?: string;
  /** Whether the plugin is currently enabled */
  enabled?: boolean;
  /** Optional UI extension configuration for adding tabs to the sidebar */
  ui?: {
    /** SVG path or Emoji for the sidebar tab */
    sidebarIcon?: string;
    /** Label for the sidebar tab */
    sidebarLabel?: string;
    /** Path to the HTML file inside the plugin folder to load as a view */
    entryPath: string;
  };
}

/**
 * Represents a plugin available in the remote registry.
 */
export interface RemotePlugin extends Omit<PluginManifest, 'path'> {
  downloadUrl: string;
  isVerified: boolean;
  downloads: number;
  updatedAt: string; // ISO Date
}

/**
 * A single step (action) within a workflow sequence.
 */
export interface Step {
  /** Unique UUID for the step instance */
  id: string;
  /** Type identifier of the step */
  type: StepType;
  /** Configuration parameters for this specific step instance */
  params: Record<string, any>;
  /** Nested steps for container-type blocks like 'loop' or 'condition' */
  steps?: Step[];
  /** UI state: whether the step is collapsed in the editor */
  collapsed?: boolean;
}

/**
 * An entry representing a mapped signal (e.g., from Serial or Shortcut) and its associated workflow.
 */
export interface SignalEntry {
  /** Human-readable label for the signal */
  label: string;
  /** UI color for categorization */
  color: string;
  /** Optional: only trigger this signal if this application is focused */
  assignedApp: string | null;
  /** Physical button ID or signal name from the hardware (e.g., 'BTN_1') */
  assignedToButton: string | string[];
  /** The sequence of steps to execute when triggered */
  steps: Step[];
  /** ID of the folder containing this signal (optional) */
  folderId?: string | null;
  /** Timestamp of creation */
  createdAt?: number;
  /** Total number of times this workflow has been executed */
  runCount?: number;
}

/**
 * Map of signal IDs to their respective entries.
 */
export type SignalMap = Record<string, SignalEntry>;

/**
 * Represents a variable with its value and explicit type.
 */
export interface VariableInfo {
  value: any;
  type: 'string' | 'int' | 'float' | 'bool' | 'list' | 'json' | 'any';
}

/**
 * Key-value store for global variables available during workflow execution.
 * All entries are stored as VariableInfo objects with an explicit type tag.
 */
export type GlobalVariables = Record<string, VariableInfo>;

/**
 * Persistent application configuration settings.
 */
export interface AppConfig {
  /** Theme name (e.g., 'dark-default') */
  theme: string;
  /** Action to take when the main window is closed */
  closeBehavior: 'close' | 'minimize' | 'tray';
  /** Accent color for the UI */
  accentColor: string;
  /** Initial tab to show on startup */
  initialTab: string;
  /** Whether to start with the app or only the tray */
  startupMode: string;
  /** Enable UI zooming */
  enableZoom: boolean;
  /** Current zoom level */
  zoomLevel: number;
  /** How to sort workflows in the UI */
  workflowSort: 'original' | 'alphabetical' | 'name' | 'active' | 'created' | 'steps';
  /** Currently active section in the sidebar */
  activeSidebarSection: string;
  /** Whether the sidebar is collapsed */
  sidebarCollapsed?: boolean;
}

/**
 * The complete global state of the PokePad application.
 */
export interface AppState {
  /** Whether the app is currently connected to the Serial device */
  connected: boolean;
  /** All mapped signals and their workflows */
  signals: SignalMap;
  /** Workflow folders/categories */
  folders: any[];
  /** ID of the currently selected folder */
  selectedFolder: string;
  /** Runtime variables */
  globalVariables: GlobalVariables;
  /** ID of the signal currently being edited */
  selectedSig: string | null;
  /** Execution logs */
  logAll: any[];
  /** Application-wide statistics */
  stats: {
    sig: number;
    act: number;
    err: number;
    success: number;
    failure: number;
  };
  /** User configuration */
  config: AppConfig;
}

/**
 * Context passed to workflow steps during execution.
 * variables uses Record<string, any> to allow VariableInfo objects (from global vars /
 * set_variable) alongside raw values (e.g. items injected by foreach loops).
 * Always read through getVarValue() in the execution engine.
 */
export interface ExecutionContext {
  /** Whether the previous step succeeded */
  prevStepSuccess: boolean;
  /** Runtime variable store — values may be VariableInfo or raw primitives */
  variables: Record<string, any>;
}

