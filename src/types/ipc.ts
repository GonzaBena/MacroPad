import { SignalMap, GlobalVariables } from './pokepad';

export interface IpcEvents {
  // Serial & Connection
  'serial-status': (data: { 
    connected: boolean; 
    port: string | null; 
    baud: number | null; 
    reconnecting?: boolean; 
    attempt?: number; 
    maxAttempts?: number; 
  }) => void;
  'serial-data': (data: { signal: string }) => void;
  'serial-error': (message: string) => void;
  
  // Execution
  'sequence-start': (signal: string) => void;
  'sequence-end': (data: { signal: string; success: boolean }) => void;
  'action-result': (data: { cmd: string; ok: boolean; output: string }) => void;
  
  // UI & System
  'show-notification': (data: { title: string; body: string }) => void;
  'update-message': (data: { text: string; type: 'info' | 'error' | 'success' }) => void;
  'apply-theme': () => void;
  'key-captured': (combo: string) => void;
  'region-selection-complete': (rect: { x: number; y: number; width: number; height: number } | null) => void;
}

export interface ArduinoApi {
  // Native Zoom
  setZoomFactor: (factor: number) => void;

  // Serial
  listPorts: () => Promise<any[]>;
  getConnectionStatus: () => Promise<any>;
  connect: (port: string, baud: number) => void;
  disconnect: () => void;
  send: (data: string) => void;
  updateSignals: (map: SignalMap) => void;
  updateGlobalVars: (vars: GlobalVariables) => void;
  testSequence: (signal: string) => void;
  selectFile: () => Promise<string | null>;
  fileExists: (path: string) => Promise<boolean>;

  // Key capture
  startKeyCapture: () => void;
  stopKeyCapture: () => void;
  onKeyCaptured: (cb: (combo: string) => void) => void;

  // Event listeners
  onStatus: (cb: (data: any) => void) => void;
  onData: (cb: (data: any) => void) => void;
  onError: (cb: (message: string) => void) => void;
  onActionResult: (cb: (data: any) => void) => void;
  onNotification: (cb: (data: any) => void) => void;
  onSequenceStart: (cb: (signal: string) => void) => void;
  onSequenceEnd: (cb: (data: any) => void) => void;

  // Window controls
  minimize: () => void;
  maximize: () => void;
  close: () => void;
  openConfigWindow: () => void;
  openAboutWindow: () => void;
  openThemePreview: () => void;
  getAppVersion: () => Promise<string>;
  listRunningApps: () => Promise<string[]>;
  listInstalledApps: () => Promise<any[]>;
  checkForUpdates: () => void;
  onUpdateMessage: (cb: (data: any) => void) => void;

  // Persistence
  loadData: () => Promise<any>;
  saveData: (data: any) => Promise<void>;
  exportData: () => Promise<any>;
  importData: () => Promise<any>;
  exportSingleWorkflow: (name: string, data: any) => Promise<any>;
  importSingleWorkflow: () => Promise<any>;
  exportFolder: (folderName: string, workflows: any[]) => Promise<any>;
  importFolder: () => Promise<any>;

  // Themes
  getThemes: () => Promise<any[]>;
  getThemeData: (id: string) => Promise<any>;
  openThemesFolder: () => void;
  importExternalTheme: () => Promise<any>;
  notifyThemeChanged: () => void;
  onApplyTheme: (cb: () => void) => void;

  // Region Selection
  startRegionSelection: () => void;
  onRegionSelected: (cb: (rect: any) => void) => void;
}

export interface SelectionApi {
  finishSelection: (rect: { x: number; y: number; width: number; height: number } | null) => void;
  cancelSelection: () => void;
}
