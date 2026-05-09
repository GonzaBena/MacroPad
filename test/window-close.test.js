const { createWindow } = require('../main-process/window');
const { BrowserWindow, app } = require('electron');
const { loadData } = require('../main-process/persistence');

jest.mock('../main-process/persistence');
jest.mock('electron', () => {
  const mApp = {
    isQuiting: false,
    getPath: jest.fn(() => '/tmp'),
  };
  const mBrowserWindow = jest.fn(() => ({
    loadFile: jest.fn(),
    on: jest.fn(),
    once: jest.fn(),
    hide: jest.fn(),
    show: jest.fn(),
    maximize: jest.fn(),
    minimize: jest.fn(),
  }));
  return {
    app: mApp,
    BrowserWindow: mBrowserWindow,
  };
});

describe('Window Close Behavior', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    app.isQuiting = false;
  });

  it('hides the window if closeBehavior is "tray"', () => {
    loadData.mockReturnValue({ config: { closeBehavior: 'tray' } });
    
    const win = createWindow();
    
    // Find the 'close' event handler
    const closeHandler = win.on.mock.calls.find(call => call[0] === 'close')[1];
    
    const event = { preventDefault: jest.fn() };
    closeHandler(event);
    
    expect(event.preventDefault).toHaveBeenCalled();
    expect(win.hide).toHaveBeenCalled();
  });

  it('does NOT hide the window if closeBehavior is "close"', () => {
    loadData.mockReturnValue({ config: { closeBehavior: 'close' } });
    
    const win = createWindow();
    
    const closeHandler = win.on.mock.calls.find(call => call[0] === 'close')[1];
    
    const event = { preventDefault: jest.fn() };
    closeHandler(event);
    
    expect(event.preventDefault).not.toHaveBeenCalled();
    expect(win.hide).not.toHaveBeenCalled();
  });

  it('allows closing if app.isQuiting is true', () => {
    loadData.mockReturnValue({ config: { closeBehavior: 'tray' } });
    app.isQuiting = true;
    
    const win = createWindow();
    
    const closeHandler = win.on.mock.calls.find(call => call[0] === 'close')[1];
    
    const event = { preventDefault: jest.fn() };
    closeHandler(event);
    
    expect(event.preventDefault).not.toHaveBeenCalled();
    expect(win.hide).not.toHaveBeenCalled();
  });
});
