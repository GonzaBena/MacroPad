import { BrowserWindow, app, screen } from "electron";
import * as path from "path";
// @ts-ignore
import { loadData } from "./persistence";

let mainWindow: BrowserWindow | null = null;
let configWindow: BrowserWindow | null = null;
let aboutWindow: BrowserWindow | null = null;
let themePreviewWindow: BrowserWindow | null = null;
let selectionWindow: BrowserWindow | null = null;

export function createWindow(startupMode: string = "normal") {
  mainWindow = new BrowserWindow({
    width: 1800,
    height: 1000,
    minWidth: 800,
    minHeight: 520,
    frame: false,
    icon: path.join(__dirname, "..", "assets", "logo.png"),
    backgroundColor: "#0c0e14",
    webPreferences: {
      preload: path.join(__dirname, "..", "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
    },
    show: startupMode !== "minimized" && startupMode !== "hidden",
  });

  mainWindow.loadFile(path.join(__dirname, "..", "renderer", "index.html"));

  mainWindow.once("ready-to-show", () => {
    if (!mainWindow) return;
    if (startupMode === "maximized") {
      mainWindow.maximize();
      mainWindow.show();
    } else if (startupMode === "minimized") {
      mainWindow.minimize();
      mainWindow.show();
    } else if (startupMode === "hidden") {
      mainWindow.hide();
    } else {
      mainWindow.show();
    }
  });

  mainWindow.on("close", (event) => {
    if ((app as any).isQuiting) return;

    const data = loadData();
    if (data && data.config && data.config.closeBehavior === "tray") {
      event.preventDefault();
      mainWindow?.hide();
    }
  });

  mainWindow.on("closed", () => {
    mainWindow = null;
  });

  return mainWindow;
}

export function createConfigWindow() {
  if (configWindow) {
    configWindow.focus();
    return configWindow;
  }

  configWindow = new BrowserWindow({
    width: 600,
    height: 700,
    resizable: true,
    frame: false,
    icon: path.join(__dirname, "..", "assets", "logo.png"),
    backgroundColor: "#0c0e14",
    webPreferences: {
      preload: path.join(__dirname, "..", "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  configWindow.loadFile(path.join(__dirname, "..", "renderer", "config.html"));

  configWindow.on("closed", () => {
    configWindow = null;
  });

  return configWindow;
}

export function createAboutWindow() {
  if (aboutWindow) {
    aboutWindow.focus();
    return aboutWindow;
  }

  aboutWindow = new BrowserWindow({
    width: 320,
    height: 400,
    resizable: false,
    frame: false,
    icon: path.join(__dirname, "..", "assets", "logo.png"),
    backgroundColor: "#0c0e14",
    webPreferences: {
      preload: path.join(__dirname, "..", "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  aboutWindow.loadFile(path.join(__dirname, "..", "renderer", "about.html"));

  aboutWindow.on("closed", () => {
    aboutWindow = null;
  });

  return aboutWindow;
}

export function createThemePreviewWindow(parentWindow: BrowserWindow) {
  if (themePreviewWindow) {
    themePreviewWindow.focus();
    return themePreviewWindow;
  }

  themePreviewWindow = new BrowserWindow({
    width: 800,
    height: 600,
    parent: parentWindow,
    modal: true,
    frame: false,
    resizable: false,
    icon: path.join(__dirname, "..", "assets", "logo.png"),
    backgroundColor: "#0c0e14",
    webPreferences: {
      preload: path.join(__dirname, "..", "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  themePreviewWindow.loadFile(
    path.join(__dirname, "..", "renderer", "theme-preview.html"),
  );

  themePreviewWindow.on("closed", () => {
    themePreviewWindow = null;
  });

  return themePreviewWindow;
}

export function createSelectionWindow() {
  if (selectionWindow) return selectionWindow;

  const displays = screen.getAllDisplays();
  
  // Calculate bounding box of all displays
  const left = Math.min(...displays.map(d => d.bounds.x));
  const top = Math.min(...displays.map(d => d.bounds.y));
  const right = Math.max(...displays.map(d => d.bounds.x + d.bounds.width));
  const bottom = Math.max(...displays.map(d => d.bounds.y + d.bounds.height));

  selectionWindow = new BrowserWindow({
    x: left,
    y: top,
    width: right - left,
    height: bottom - top,
    transparent: true,
    frame: false,
    alwaysOnTop: true,
    fullscreen: process.platform !== "darwin", // MacOS doesn't like transparent fullscreen
    enableLargerThanScreen: true,
    skipTaskbar: true,
    resizable: false,
    movable: false,
    webPreferences: {
      preload: path.join(__dirname, "..", "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  // On macOS, we can't use fullscreen for transparency properly with all monitors
  if (process.platform === "darwin") {
    selectionWindow.setSize(right - left, bottom - top);
    selectionWindow.setPosition(left, top);
  }

  selectionWindow.setAlwaysOnTop(true, "screen-saver");
  selectionWindow.loadFile(path.join(__dirname, "..", "renderer", "selection.html"));

  selectionWindow.on("closed", () => {
    selectionWindow = null;
  });

  return selectionWindow;
}

export function getWindow() {
  return mainWindow;
}
