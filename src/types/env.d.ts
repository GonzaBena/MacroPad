import { ArduinoApi, SelectionApi } from './ipc';

declare global {
  interface Window {
    arduino: ArduinoApi;
    selectionApi: SelectionApi;
    
    // Global functions exposed by renderer modules
    switchTab: (name: string, el: HTMLElement) => void;
    closeCmdModal: () => void;
    showPrompt: (title: string, defaultValue: string, callback: (val: string) => void) => void;
    about: () => void;
    undo: () => void;
    redo: () => void;
    exportConfig: () => void;
    importConfig: () => void;
    openConfigView: () => void;
    closeConfigView: () => void;
    saveConfigView: () => void;
    
    // Workflows functions
    openGlobalVarsModal: () => void;
    addFolder: () => void;
    changeSort: (criteria: string) => void;
    addSignal: () => void;
    renameSignal: (oldName: string) => void;
    duplicateSignal: (sig: string) => void;
    copySignalToClipboard: (sig: string) => void;
    exportSingleWorkflow: (sig: string) => void;
    importWorkflow: (e: MouseEvent) => void;
    deleteCurrentSignal: () => void;
    updateSignalLabel: (val: string) => void;
    refreshRunningApps: () => Promise<string[]>;
    selectSignal: (sig: string) => void;
    toggleAssignMenu: (e: MouseEvent) => void;
    assignApp: () => void;
    updateParam: (path: number[], key: string, value: any) => void;
    changeStepType: (path: number[], newType: string) => void;
    deleteStep: (path: number[]) => void;
    toggleStepCollapse: (path: number[]) => void;
    addStep: (type: string, containerPath?: number[] | null, index?: number) => void;
    testCurrentSignal: () => void;
    startKeyCapture: (path: number[]) => void;
    browseFile: (path: number[]) => void;
    startRegionSelection: (path: number[]) => void;
    toggleStepMenu: () => void;
    handleScriptInput: (path: number[]) => void;
    syncScriptScroll: (path: number[]) => void;
    handleScriptKeydown: (e: KeyboardEvent, path: number[]) => void;
    updateScriptEditor: (path: number[]) => void;
    
    // Others
    refreshPorts: () => void;
    toggleConnect: () => void;
    cancelReconnect: () => void;
    clearLog: () => void;
    sendSerial: () => void;
    marked: any;
  }
}

export {};
