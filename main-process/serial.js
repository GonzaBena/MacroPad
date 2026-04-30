const { ipcMain } = require("electron");
const { getWindow } = require("./window");

let activePort = null;

function setupSerial() {
  ipcMain.handle("list-ports", async () => {
    try {
      const { SerialPort } = require("serialport");
      const { ReadlineParser } = require("@serialport/parser-readline");
      const allPorts = await SerialPort.list();

      const validPorts = [];
      const testPromises = allPorts.map(async (portInfo) => {
        // Si el puerto ya está conectado, lo incluimos directamente
        if (activePort && activePort.isOpen && activePort.path === portInfo.path) {
          portInfo.signature = "Conectado";
          validPorts.push(portInfo);
          return;
        }

        return new Promise((resolve) => {
          let resolved = false;
          let testPort;

          const finish = () => {
            if (!resolved) {
              resolved = true;
              if (testPort && testPort.isOpen) testPort.close();
              resolve();
            }
          };

          const timeout = setTimeout(finish, 2500); // 2.5s máximo por puerto

          try {
            testPort = new SerialPort({ path: portInfo.path, baudRate: 9600 });
            const parser = testPort.pipe(new ReadlineParser({ delimiter: "\n" }));

            testPort.on("open", () => {
              // Esperamos 1.5s para que el Arduino termine de reiniciar
              setTimeout(() => {
                if (!resolved && testPort.isOpen) {
                  testPort.write("IDENTIFY\n");
                }
              }, 1500);
            });

            parser.on("data", (line) => {
              const signal = line.trim();
              if (signal && !resolved) {
                portInfo.signature = signal; // Guardamos la firma
                validPorts.push(portInfo);
                finish();
              }
            });

            testPort.on("error", finish);
          } catch (err) {
            finish();
          }
        });
      });

      await Promise.all(testPromises);
      return validPorts;

    } catch (error) {
      console.error("Failed to list serial ports:", error);
      return [];
    }
  });

  ipcMain.on("connect-serial", (_, { port, baud }) => connectSerial(port, baud));

  ipcMain.on("disconnect-serial", () => {
    if (activePort?.isOpen) {
      activePort.close(() => {
        const win = getWindow();
        if (win) win.webContents.send("serial-status", { connected: false });
      });
    }
  });

  ipcMain.on("send-serial", (_, data) => {
    if (activePort?.isOpen) activePort.write(data + "\n");
  });
}

function connectSerial(portPath, baudRate = 9600) {
  const win = getWindow();
  if (activePort?.isOpen) activePort.close();

  let SerialPort, ReadlineParser;
  try {
    ({ SerialPort } = require("serialport"));
    ({ ReadlineParser } = require("@serialport/parser-readline"));
  } catch (e) {
    if (win) {
      win.webContents.send(
        "serial-error",
        "serialport no disponible — corré: npx electron-rebuild"
      );
    }
    return;
  }

  try {
    activePort = new SerialPort({
      path: portPath,
      baudRate: parseInt(baudRate),
    });

    const parser = activePort.pipe(new ReadlineParser({ delimiter: "\n" }));

    activePort.on("open", () => {
      if (win) {
        win.webContents.send("serial-status", {
          connected: true,
          port: portPath,
          baud: baudRate,
        });
      }
    });

    parser.on("data", (line) => {
      const signal = line.trim();
      if (!signal) return;
      if (win) {
        win.webContents.send("serial-data", { signal, ts: Date.now() });
        // We will need to trigger execution here. 
        // We'll import the execution module later or emit an event.
        const { executeSequence } = require("./execution");
        executeSequence(signal);
      }
    });

    activePort.on("error", (err) => {
      if (win) {
        win.webContents.send("serial-error", err.message);
        win.webContents.send("serial-status", { connected: false });
      }
    });

    activePort.on("close", () => {
      if (win) win.webContents.send("serial-status", { connected: false });
    });
  } catch (err) {
    if (win) win.webContents.send("serial-error", err.message);
  }
}

function getActivePort() {
  return activePort;
}

module.exports = {
  setupSerial,
  getActivePort,
};
