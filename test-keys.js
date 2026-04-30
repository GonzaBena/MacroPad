const { app, BrowserWindow } = require("electron");
app.whenReady().then(() => {
  const win = new BrowserWindow({width: 400, height: 400});
  win.webContents.on('before-input-event', (event, input) => {
    console.log(input);
  });
  win.loadURL('about:blank');
});
