"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.createWindow = createWindow;
exports.createConfigWindow = createConfigWindow;
exports.createAboutWindow = createAboutWindow;
exports.createThemePreviewWindow = createThemePreviewWindow;
exports.createSelectionWindow = createSelectionWindow;
exports.getWindow = getWindow;
const electron_1 = require("electron");
const path = __importStar(require("path"));
// @ts-ignore
const persistence_1 = require("./persistence");
let mainWindow = null;
let configWindow = null;
let aboutWindow = null;
let themePreviewWindow = null;
let selectionWindow = null;
function createWindow(startupMode = "normal") {
    mainWindow = new electron_1.BrowserWindow({
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
        if (!mainWindow)
            return;
        if (startupMode === "maximized") {
            mainWindow.maximize();
            mainWindow.show();
        }
        else if (startupMode === "minimized") {
            mainWindow.minimize();
            mainWindow.show();
        }
        else if (startupMode === "hidden") {
            mainWindow.hide();
        }
        else {
            mainWindow.show();
        }
    });
    mainWindow.on("close", (event) => {
        if (electron_1.app.isQuiting)
            return;
        const data = (0, persistence_1.loadData)();
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
function createConfigWindow() {
    if (configWindow) {
        configWindow.focus();
        return configWindow;
    }
    configWindow = new electron_1.BrowserWindow({
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
function createAboutWindow() {
    if (aboutWindow) {
        aboutWindow.focus();
        return aboutWindow;
    }
    aboutWindow = new electron_1.BrowserWindow({
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
function createThemePreviewWindow(parentWindow) {
    if (themePreviewWindow) {
        themePreviewWindow.focus();
        return themePreviewWindow;
    }
    themePreviewWindow = new electron_1.BrowserWindow({
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
    themePreviewWindow.loadFile(path.join(__dirname, "..", "renderer", "theme-preview.html"));
    themePreviewWindow.on("closed", () => {
        themePreviewWindow = null;
    });
    return themePreviewWindow;
}
function createSelectionWindow() {
    if (selectionWindow)
        return selectionWindow;
    const displays = electron_1.screen.getAllDisplays();
    // Calculate bounding box of all displays
    const left = Math.min(...displays.map(d => d.bounds.x));
    const top = Math.min(...displays.map(d => d.bounds.y));
    const right = Math.max(...displays.map(d => d.bounds.x + d.bounds.width));
    const bottom = Math.max(...displays.map(d => d.bounds.y + d.bounds.height));
    selectionWindow = new electron_1.BrowserWindow({
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
function getWindow() {
    return mainWindow;
}
