const { Tray, Menu, app } = require("electron");
const path = require("path");

let tray = null;

function setupTray(mainWindow) {
  if (tray) return tray;

  const iconPath = path.join(__dirname, "..", "assets", "logo.png");
  tray = new Tray(iconPath);

  const contextMenu = Menu.buildFromTemplate([
    {
      label: "Mostrar MacroPad",
      click: () => {
        mainWindow.show();
      },
    },
    { type: "separator" },
    {
      label: "Salir",
      click: () => {
        app.isQuiting = true;
        app.quit();
      },
    },
  ]);

  tray.setToolTip("PokePad MacroPad");
  tray.setContextMenu(contextMenu);

  tray.on("double-click", () => {
    mainWindow.show();
  });

  return tray;
}

module.exports = { setupTray };
