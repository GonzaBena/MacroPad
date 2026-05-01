const { BrowserWindow } = require("electron");
const path = require("path");

let mainWindow = null;
let configWindow = null;

function createWindow() {
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
  });

  mainWindow.loadFile(path.join(__dirname, "..", "renderer", "index.html"));

  mainWindow.on("closed", () => {
    mainWindow = null;
    if (configWindow) configWindow.close();
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
    parent: mainWindow,
    modal: false, // Set to true if you want it to block the main window
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
    parent: mainWindow,
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

function getWindow() {
  return mainWindow;
}

module.exports = {
  createWindow,
  createConfigWindow,
  createAboutWindow,
  getWindow,
};
