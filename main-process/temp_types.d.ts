declare module "./window" {
  export function getWindow(): any;
  export function createWindow(startupMode?: string): any;
  export function createConfigWindow(): any;
  export function createAboutWindow(): any;
  export function createThemePreviewWindow(parent: any): any;
  export function createSelectionWindow(): any;
}

declare module "./keyboard" {
  export function simulateKey(combo: string): Promise<void>;
  export function listRunningApps(): Promise<string[]>;
  export function listInstalledApps(): Promise<any[]>;
  export function setupKeyboard(): void;
}

declare module "./media" {
  export function mediaControl(action: string): Promise<void>;
  export function setupMedia(): void;
}
