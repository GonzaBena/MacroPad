const { BrowserWindow } = require("electron");
const path = require("path");

let win = null;

function createWindow() {
  win = new BrowserWindow({
    width: 1100,
    height: 700,
    minWidth: 800,
    minHeight: 520,
    frame: false,
    icon: path.join(__dirname, 'assets', 'logo.png'),
    backgroundColor: "#0c0e14",
    webPreferences: {
      preload: path.join(__dirname, "..", "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  win.loadFile(path.join(__dirname, "..", "renderer", "index.html"));

  win.on("closed", () => {
    win = null;
  });

  return win;
}

function getWindow() {
  return win;
}

module.exports = {
  createWindow,
  getWindow,
};
