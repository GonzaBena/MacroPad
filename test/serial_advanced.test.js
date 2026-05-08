jest.mock('serialport', () => ({
  SerialPort: Object.assign(jest.fn(), { list: jest.fn().mockResolvedValue([]) }),
}));
jest.mock('@serialport/parser-readline', () => ({ ReadlineParser: jest.fn() }));
jest.mock('../main-process/window', () => ({ getWindow: jest.fn(() => null) }));
jest.mock('../main-process/execution', () => ({ executeSequence: jest.fn() }));

// ─── verifyPort ───────────────────────────────────────────────────────────────

describe('verifyPort', () => {
  let verifyPort;
  let portHandlers, parserHandlers, mockPortInstance;

  beforeEach(() => {
    jest.useFakeTimers();
    // Módulo fresco por test → estado interno (verifiedPorts, currentlyVerifying) limpio
    jest.resetModules();

    portHandlers = {};
    parserHandlers = {};

    const mockParser = {
      on: jest.fn((ev, cb) => { parserHandlers[ev] = cb; }),
    };

    mockPortInstance = {
      isOpen: true,
      path: '',
      pipe: jest.fn(() => mockParser),
      on: jest.fn((ev, cb) => { portHandlers[ev] = cb; }),
      write: jest.fn(),
      close: jest.fn(),
    };

    require('serialport').SerialPort.mockImplementation(() => mockPortInstance);
    require('@serialport/parser-readline').ReadlineParser.mockImplementation(() => ({}));

    verifyPort = require('../main-process/serial').verifyPort;
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('devuelve true cuando el puerto responde con FIRMA', async () => {
    const promise = verifyPort('/dev/cu.test');

    portHandlers['open']();
    jest.advanceTimersByTime(2500);
    parserHandlers['data']('POKEPAD_V1\n');

    expect(await promise).toBe(true);
  });

  it('envía el handshake IDENTIFY exactamente 2.5 s después de abrir', async () => {
    const promise = verifyPort('/dev/cu.handshake');

    portHandlers['open']();

    jest.advanceTimersByTime(2499);
    expect(mockPortInstance.write).not.toHaveBeenCalled();

    jest.advanceTimersByTime(1);
    expect(mockPortInstance.write).toHaveBeenCalledWith('IDENTIFY\n');

    // Resolver la promesa pendiente
    parserHandlers['data']('POKEPAD_V1\n');
    await promise;
  });

  it('devuelve false cuando el puerto emite un error', async () => {
    const promise = verifyPort('/dev/cu.error');
    portHandlers['error'](new Error('ENOENT: no such file'));
    expect(await promise).toBe(false);
  });

  it('devuelve false cuando se alcanza el timeout de 7 s', async () => {
    const promise = verifyPort('/dev/cu.timeout');
    jest.advanceTimersByTime(7000);
    expect(await promise).toBe(false);
  });

  it('devuelve false cuando el constructor de SerialPort lanza una excepción', async () => {
    require('serialport').SerialPort.mockImplementationOnce(() => {
      throw new Error('Puerto ocupado');
    });
    expect(await verifyPort('/dev/cu.throws')).toBe(false);
  });

  it('ignora datos que no son FIRMA y espera el timeout', async () => {
    const promise = verifyPort('/dev/cu.noise');

    portHandlers['open']();
    jest.advanceTimersByTime(2500);
    parserHandlers['data']('DATO_DESCONOCIDO\n');

    // Avanzar hasta pasado el timeout de 7 s (ya llevamos 2500 ms)
    jest.advanceTimersByTime(5000);

    expect(await promise).toBe(false);
  });

  it('devuelve true desde la caché en la segunda llamada sin abrir el puerto de nuevo', async () => {
    // Primera verificación exitosa
    const p1 = verifyPort('/dev/cu.cached');
    portHandlers['open']();
    jest.advanceTimersByTime(2500);
    parserHandlers['data']('POKEPAD_V1\n');
    await p1;

    // Segunda llamada → debe usar la caché
    require('serialport').SerialPort.mockClear();
    expect(await verifyPort('/dev/cu.cached')).toBe(true);
    expect(require('serialport').SerialPort).not.toHaveBeenCalled();
  });

  it('bloquea la verificación concurrente del mismo puerto', async () => {
    const p1 = verifyPort('/dev/cu.concurrent');
    // Llamada concurrente: currentlyVerifying ya tiene el path
    const p2Result = await verifyPort('/dev/cu.concurrent');
    expect(p2Result).toBe(false);

    // Limpiar p1
    portHandlers['error'](new Error('fin de test'));
    await p1;
  });
});
