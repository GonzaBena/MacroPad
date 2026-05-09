const { BrowserWindow, app } = require("electron");
const path = require("path");
const { loadData } = require("./persistence");

let mainWindow = null;
let configWindow = null;

function createWindow(startupMode = "normal") {
  mainWindow = new BrowserWindow({
    width: 1100,
    height: 700,
    minWidth: 800,
    minHeight: 520,
    frame: false,
    icon: path.join(__dirname, '..', 'assets', 'logo.png'),
    backgroundColor: "#0c0e14",
    webPreferences: {
      preload: path.join(__dirname, "..", "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
    },
    show: startupMode !== "minimized" && startupMode !== "hidden"
  });

  mainWindow.loadFile(path.join(__dirname, "..", "renderer", "index.html"));

  mainWindow.once("ready-to-show", () => {
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
    if (app.isQuiting) return;

    const data = loadData();
    if (data && data.config && data.config.closeBehavior === "tray") {
      event.preventDefault();
      mainWindow.hide();
    }
  });

  mainWindow.on("closed", () => {
    mainWindow = null;
  });

  return mainWindow;
}

function createConfigWindow() {
  if (configWindow) {
    configWindow.focus();
    return configWindow;
  }

  configWindow = new BrowserWindow({
    width: 600,
    height: 700,
    resizable: true,
    frame: false,
    icon: path.join(__dirname, '..', 'assets', 'logo.png'),
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

let aboutWindow = null;

function createAboutWindow() {
  if (aboutWindow) {
    aboutWindow.focus();
    return aboutWindow;
  }

  aboutWindow = new BrowserWindow({
    width: 320,
    height: 400,
    resizable: false,
    frame: false,
    icon: path.join(__dirname, '..', 'assets', 'logo.png'),
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

let themePreviewWindow = null;

function createThemePreviewWindow(parentWindow) {
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
    icon: path.join(__dirname, '..', 'assets', 'logo.png'),
    backgroundColor: "#0c0e14",
    webPreferences: {
      preload: path.join(__dirname, "..", "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  themePreviewWindow.loadFile(path.join(__dirname, "..", "renderer", "theme-preview.html"));

  themePreviewWindow.on("closed", () => {
    themePreviewWindow = null;
  });

  return themePreviewWindow;
}

function getWindow() {
  return mainWindow;
}

module.exports = {
  createWindow,
  createConfigWindow,
  createAboutWindow,
  createThemePreviewWindow,
  getWindow,
};
