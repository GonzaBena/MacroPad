jest.mock('../main-process/window', () => ({ getWindow: jest.fn(() => null) }));
jest.mock('serialport', () => ({
  SerialPort: Object.assign(jest.fn(), { list: jest.fn().mockResolvedValue([]) }),
}));
jest.mock('@serialport/parser-readline', () => ({ ReadlineParser: jest.fn() }));
jest.mock('../main-process/execution', () => ({ executeSequence: jest.fn() }));

const { isPotentialDevice, getActivePort, setupSerial } = require('../main-process/serial');
const { ipcMain } = require('electron');

// Freeze timers so startAutoConnect() no crea handles activos
beforeAll(() => jest.useFakeTimers());
afterAll(() => jest.useRealTimers());

// ─── isPotentialDevice ────────────────────────────────────────────────────────

describe('isPotentialDevice – VID/PID exacto', () => {
  it('detecta CH340 (1a86:7523)', () => {
    expect(isPotentialDevice({ path: '/dev/ttyUSB0', vendorId: '1a86', productId: '7523' })).toBe(true);
  });

  it('detecta FTDI (0403:6001)', () => {
    expect(isPotentialDevice({ path: '/dev/ttyUSB0', vendorId: '0403', productId: '6001' })).toBe(true);
  });

  it('normaliza el prefijo 0x en VID/PID', () => {
    expect(isPotentialDevice({ path: '/dev/ttyUSB0', vendorId: '0x1A86', productId: '0x7523' })).toBe(true);
  });

  it('normaliza VID/PID en mayúsculas', () => {
    expect(isPotentialDevice({ path: '/dev/ttyUSB0', vendorId: '1A86', productId: '7523' })).toBe(true);
  });
});

describe('isPotentialDevice – fabricante', () => {
  it('detecta fabricante wch', () => {
    expect(isPotentialDevice({ path: '/dev/x', manufacturer: 'WCH CH340' })).toBe(true);
  });

  it('detecta fabricante ftdi', () => {
    expect(isPotentialDevice({ path: '/dev/x', manufacturer: 'FTDI' })).toBe(true);
  });

  it('detecta fabricante arduino', () => {
    expect(isPotentialDevice({ path: '/dev/x', manufacturer: 'Arduino LLC' })).toBe(true);
  });

  it('detecta fabricante usb-serial', () => {
    expect(isPotentialDevice({ path: '/dev/x', manufacturer: 'USB-Serial Controller' })).toBe(true);
  });
});

describe('isPotentialDevice – PnP / nombre amigable / path', () => {
  it('detecta pnpId con VID 1a86', () => {
    expect(isPotentialDevice({ path: '/dev/x', pnpId: 'USB\\VID_1A86&PID_7523' })).toBe(true);
  });

  it('detecta pnpId con VID 0403', () => {
    expect(isPotentialDevice({ path: '/dev/x', pnpId: 'USB\\VID_0403&PID_6001' })).toBe(true);
  });

  it('detecta friendlyName que contiene arduino', () => {
    expect(isPotentialDevice({ path: '/dev/x', friendlyName: 'Arduino Uno' })).toBe(true);
  });

  it('detecta friendlyName que contiene ch340', () => {
    expect(isPotentialDevice({ path: '/dev/x', friendlyName: 'USB-SERIAL CH340' })).toBe(true);
  });

  it('detecta path que contiene usbserial (macOS)', () => {
    expect(isPotentialDevice({ path: '/dev/cu.usbserial-1410' })).toBe(true);
  });
});

describe('isPotentialDevice – casos negativos', () => {
  it('rechaza un puerto genérico sin coincidencias', () => {
    expect(isPotentialDevice({
      path: '/dev/ttyS0',
      vendorId: '1234',
      productId: '5678',
      manufacturer: 'Generic',
    })).toBe(false);
  });

  it('rechaza un objeto de puerto vacío', () => {
    expect(isPotentialDevice({ path: '/dev/ttyS0' })).toBe(false);
  });

  it('rechaza cuando todos los campos son undefined', () => {
    expect(isPotentialDevice({ path: '/dev/cu.Bluetooth' })).toBe(false);
  });
});

// ─── getActivePort ────────────────────────────────────────────────────────────

describe('getActivePort', () => {
  it('devuelve null cuando no hay ningún puerto conectado', () => {
    expect(getActivePort()).toBeNull();
  });
});

// ─── setupSerial – registro de canales IPC ─────────────────────────────────

describe('setupSerial', () => {
  it('registra todos los canales IPC requeridos', () => {
    setupSerial();
    const handles = ipcMain.handle.mock.calls.map((c) => c[0]);
    const ons    = ipcMain.on.mock.calls.map((c) => c[0]);
    expect(handles).toContain('list-ports');
    expect(ons).toContain('connect-serial');
    expect(ons).toContain('disconnect-serial');
    expect(ons).toContain('send-serial');
    expect(ons).toContain('cancel-reconnect');
  });
});
