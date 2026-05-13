const { setupPlugins } = require('../main-process/plugins');
const { ipcMain, app, dialog } = require('electron');
const fs = require('fs');
const { execSync } = require('child_process');

jest.mock('electron', () => ({
  app: {
    getPath: jest.fn((name) => {
      if (name === 'userData') return '/mock/user-data';
      if (name === 'temp') return '/mock/temp';
      return '/mock';
    }),
    getAppPath: jest.fn(() => '/mock/app-path'),
  },
  ipcMain: {
    handle: jest.fn(),
  },
  dialog: {
    showOpenDialog: jest.fn(),
  },
}));

jest.mock('fs', () => ({
  existsSync: jest.fn(() => true),
  mkdirSync: jest.fn(),
  readFileSync: jest.fn(() => JSON.stringify({ name: 'Test Plugin', version: '1.0.0', id: 'test' })),
  readdirSync: jest.fn(() => []),
  writeFileSync: jest.fn(),
  unlinkSync: jest.fn(),
  rmSync: jest.fn(),
  renameSync: jest.fn(),
}));

jest.mock('child_process', () => ({
  execSync: jest.fn(),
}));

jest.mock('../main-process/logger', () => ({
  info: jest.fn(),
  error: jest.fn(),
  warn: jest.fn(),
}));

// Mock global fetch
global.fetch = jest.fn();

describe('Plugins Main Process', () => {
  let handlers = {};

  beforeEach(() => {
    jest.clearAllMocks();
    ipcMain.handle.mockImplementation((name, fn) => {
      handlers[name] = fn;
    });
    setupPlugins();
  });

  it('registers IPC handlers', () => {
    expect(ipcMain.handle).toHaveBeenCalledWith('get-plugins', expect.any(Function));
    expect(ipcMain.handle).toHaveBeenCalledWith('get-remote-plugins', expect.any(Function));
    expect(ipcMain.handle).toHaveBeenCalledWith('install-remote-plugin', expect.any(Function));
    expect(ipcMain.handle).toHaveBeenCalledWith('install-local-plugin', expect.any(Function));
  });

  it('installs a remote plugin successfully', async () => {
    const mockResponse = {
      ok: true,
      arrayBuffer: jest.fn().mockResolvedValue(new ArrayBuffer(8)),
      statusText: 'OK'
    };
    global.fetch.mockResolvedValue(mockResponse);

    const installHandler = handlers['install-remote-plugin'];
    const result = await installHandler(null, { id: 'test-plugin', downloadUrl: 'http://example.com/test.zip' });

    expect(result.success).toBe(true);
    expect(global.fetch).toHaveBeenCalledWith('http://example.com/test.zip');
    expect(fs.writeFileSync).toHaveBeenCalled();
    expect(execSync).toHaveBeenCalledWith(expect.stringContaining('tar -xf'));
    expect(fs.unlinkSync).toHaveBeenCalled();
  });

  it('handles installation failure during download', async () => {
    global.fetch.mockResolvedValue({
      ok: false,
      statusText: 'Not Found'
    });

    const installHandler = handlers['install-remote-plugin'];
    const result = await installHandler(null, { id: 'test-plugin', downloadUrl: 'http://example.com/test.zip' });

    expect(result.success).toBe(false);
    expect(result.error).toContain('Failed to download');
  });

  it('handles installation failure during extraction', async () => {
    global.fetch.mockResolvedValue({
      ok: true,
      arrayBuffer: jest.fn().mockResolvedValue(new ArrayBuffer(8))
    });
    execSync.mockImplementation(() => {
      throw new Error('Tar failed');
    });

    const installHandler = handlers['install-remote-plugin'];
    const result = await installHandler(null, { id: 'test-plugin', downloadUrl: 'http://example.com/test.zip' });

    expect(result.success).toBe(false);
    expect(result.error).toBe('Tar failed');
  });

  describe('install-local-plugin', () => {
    beforeEach(() => {
      execSync.mockImplementation(() => {}); // Success by default for these tests
    });

    it('handles cancellation', async () => {
      dialog.showOpenDialog.mockResolvedValue({ canceled: true });
      const handler = handlers['install-local-plugin'];
      const result = await handler();
      expect(result.canceled).toBe(true);
    });

    it('installs a valid local plugin', async () => {
      dialog.showOpenDialog.mockResolvedValue({ canceled: false, filePaths: ['/path/to/plugin.zip'] });
      fs.readdirSync.mockReturnValue([]); // No subfolder wrapping
      fs.existsSync.mockReturnValue(true); // manifest and index exist
      fs.readFileSync.mockReturnValue(JSON.stringify({ id: 'valid-id', name: 'Valid', version: '1.0.0' }));
      
      const handler = handlers['install-local-plugin'];
      const result = await handler();

      expect(result.success).toBe(true);
      expect(result.id).toBe('valid-id');
      expect(execSync).toHaveBeenCalledWith(expect.stringContaining('tar -xf'));
    });

    it('fails when manifest.json is missing', async () => {
      dialog.showOpenDialog.mockResolvedValue({ canceled: false, filePaths: ['/path/to/plugin.zip'] });
      fs.readdirSync.mockReturnValue([]);
      fs.existsSync.mockImplementation((path) => {
        if (typeof path === 'string' && path.endsWith('manifest.json')) return false;
        return true;
      });

      const handler = handlers['install-local-plugin'];
      const result = await handler();

      expect(result.success).toBe(false);
      expect(result.error).toContain('No se encontró manifest.json');
    });

    it('fails when manifest fields are missing', async () => {
      dialog.showOpenDialog.mockResolvedValue({ canceled: false, filePaths: ['/path/to/plugin.zip'] });
      fs.readdirSync.mockReturnValue([]);
      fs.existsSync.mockReturnValue(true);
      fs.readFileSync.mockReturnValue(JSON.stringify({ id: 'incomplete' })); // missing name, version

      const handler = handlers['install-local-plugin'];
      const result = await handler();

      expect(result.success).toBe(false);
      expect(result.error).toContain('debe contener \'id\', \'name\' y \'version\'');
    });
  });
});
