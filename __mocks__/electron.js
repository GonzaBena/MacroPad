const NotificationMock = Object.assign(
  jest.fn(() => ({ show: jest.fn() })),
  { isSupported: jest.fn(() => false) }
);

module.exports = {
  app: {
    getPath: jest.fn(() => '/tmp/pokepad-test'),
  },
  ipcMain: {
    handle: jest.fn(),
    on: jest.fn(),
  },
  shell: {
    openExternal: jest.fn(() => Promise.resolve()),
    openPath: jest.fn(() => Promise.resolve('')),
  },
  clipboard: {
    writeText: jest.fn(),
  },
  Notification: NotificationMock,
  dialog: {
    showSaveDialog: jest.fn(),
    showOpenDialog: jest.fn(),
  },
};
