/**
 * Core types for PokePad
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
  | 'note';

export interface Step {
  id: string;
  type: StepType;
  params: Record<string, any>;
  steps?: Step[]; // For container steps like 'loop' and 'condition'
}

export interface SignalEntry {
  label: string;
  color: string;
  assignedApp: string | null;
  assignedToButton: string | string[]; // Can be 'RAPIDA', 'MEDIA', 'LENTA' or a list
  steps: Step[];
  folderId?: string | null;
  createdAt?: number;
  runCount?: number;
}

export type SignalMap = Record<string, SignalEntry>;

export interface GlobalVariables {
  [key: string]: string | number | boolean | any[];
}

export interface AppConfig {
  theme: string;
  closeBehavior: 'close' | 'minimize' | 'tray';
  accentColor: string;
  initialTab: string;
  startupMode: string;
  enableZoom: boolean;
  zoomLevel: number;
  workflowSort: 'original' | 'alphabetical';
  activeSidebarSection: string;
  sidebarCollapsed?: boolean;
}

export interface AppState {
  connected: boolean;
  signals: SignalMap;
  folders: any[]; // To be detailed later if needed
  selectedFolder: string;
  globalVariables: GlobalVariables;
  selectedSig: string | null;
  logAll: any[];
  stats: {
    sig: number;
    act: number;
    err: number;
    success: number;
    failure: number;
  };
  config: AppConfig;
}

export interface ExecutionContext {
  prevStepSuccess: boolean;
  variables: GlobalVariables;
}
