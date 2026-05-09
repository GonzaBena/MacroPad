let setupTray;
let Tray, Menu, app;

describe('Tray Module', () => {
  let mainWindow;

  beforeEach(() => {
    jest.resetModules();
    jest.clearAllMocks();
    const electron = require('electron');
    Tray = electron.Tray;
    Menu = electron.Menu;
    app = electron.app;
    setupTray = require('../main-process/tray').setupTray;
    mainWindow = {
      show: jest.fn(),
    };
  });

  it('sets up the tray icon with tooltip and context menu', () => {
    const trayInstance = setupTray(mainWindow);

    expect(Tray).toHaveBeenCalled();
    expect(trayInstance.setToolTip).toHaveBeenCalledWith('PokePad MacroPad');
    expect(trayInstance.setContextMenu).toHaveBeenCalled();
    expect(Menu.buildFromTemplate).toHaveBeenCalled();
  });

  it('returns the same tray instance if already setup', () => {
    const tray1 = setupTray(mainWindow);
    const tray2 = setupTray(mainWindow);

    expect(Tray).toHaveBeenCalledTimes(1);
    expect(tray1).toBe(tray2);
  });

  it('restores the window when "Mostrar MacroPad" is clicked', () => {
    setupTray(mainWindow);
    
    // Get the template passed to Menu.buildFromTemplate
    const template = Menu.buildFromTemplate.mock.calls[0][0];
    const showItem = template.find(item => item.label === 'Mostrar MacroPad');
    
    expect(showItem).toBeDefined();
    showItem.click();
    expect(mainWindow.show).toHaveBeenCalled();
  });

  it('quits the app when "Salir" is clicked', () => {
    setupTray(mainWindow);
    
    const template = Menu.buildFromTemplate.mock.calls[0][0];
    const exitItem = template.find(item => item.label === 'Salir');
    
    expect(exitItem).toBeDefined();
    
    app.quit = jest.fn();
    exitItem.click();
    
    expect(app.isQuiting).toBe(true);
    expect(app.quit).toHaveBeenCalled();
  });

  it('shows window on double-click', () => {
    const trayInstance = setupTray(mainWindow);
    
    // Find the double-click handler
    const doubleClickHandler = trayInstance.on.mock.calls.find(call => call[0] === 'double-click')[1];
    
    doubleClickHandler();
    expect(mainWindow.show).toHaveBeenCalled();
  });
});
