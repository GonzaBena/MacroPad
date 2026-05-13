import { Tray, Menu, app, BrowserWindow } from "electron";
import * as path from "path";

let tray: Tray | null = null;

export function setupTray(mainWindow: BrowserWindow) {
  if (tray) return tray;

  const iconPath = path.join(app.getAppPath(), "assets", "logo.png");
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
        (app as any).isQuiting = true;
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
