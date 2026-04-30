const { app } = require('electron');
const { SerialPort } = require('serialport');

app.whenReady().then(async () => {
  try {
    const ports = await SerialPort.list();
    console.log("SUCCESS! Ports:", ports.map(p => p.path));
  } catch (e) {
    console.error("ERROR:", e);
  }
  app.quit();
});
