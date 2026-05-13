jest.mock('../renderer/js/state.js', () => ({ state: { connected: false } }));
jest.mock('../renderer/js/monitor.js', () => ({ log: jest.fn() }));
jest.mock('../renderer/js/ui.js', () => ({ showToast: jest.fn() }));

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makeEls() {
  const portSel = {
    value: '',
    innerHTML: '',
    options: [],
    selectedIndex: -1,
    appendChild: jest.fn(function (o) { this.options.push(o); }),
  };
  return {
    'port-sel': portSel,
    'baud-sel': { value: '9600' },
    'tb-dot': { classList: { toggle: jest.fn() } },
    's-dot': { classList: { toggle: jest.fn() } },
    's-text': { textContent: '', classList: { toggle: jest.fn() } },
    'btn-conn': { textContent: '', className: '' },
    'reconnect-indicator': { classList: { remove: jest.fn(), add: jest.fn() } },
    'reconnect-text': { textContent: '' },
  };
}

let els, mod, state, log, showToast;

beforeEach(() => {
  jest.resetModules();

  els = makeEls();

  global.window = {
    arduino: {
      listPorts: jest.fn().mockResolvedValue([]),
      connect: jest.fn(),
      disconnect: jest.fn(),
      send: jest.fn(),
    },
  };

  global.document = {
    getElementById: jest.fn((id) => els[id] || null),
    createElement: jest.fn(() => ({ value: '', textContent: '' })),
  };

  mod      = require('../renderer/js/connection.js');
  state    = require('../renderer/js/state.js').state;
  log      = require('../renderer/js/monitor.js').log;
  showToast = require('../renderer/js/ui.js').showToast;
});

// ─── refreshPorts ─────────────────────────────────────────────────────────────

describe('refreshPorts', () => {
  it('llama a window.arduino.listPorts', async () => {
    await mod.refreshPorts();
    expect(global.window.arduino.listPorts).toHaveBeenCalled();
  });

  it('resetea el innerHTML del selector antes de añadir opciones', async () => {
    await mod.refreshPorts();
    expect(els['port-sel'].innerHTML).toBe('<option value="">— Seleccioná un puerto —</option>');
  });

  it('registra un mensaje cuando no se encuentran puertos', async () => {
    global.window.arduino.listPorts.mockResolvedValue([]);
    await mod.refreshPorts();
    expect(log).toHaveBeenCalledWith('No se encontraron dispositivos PokePad', 'sys');
  });

  it('añade una opción por cada puerto devuelto', async () => {
    global.window.arduino.listPorts.mockResolvedValue([
      { path: '/dev/cu.a', signature: 'POKEPAD_V1' },
      { path: '/dev/cu.b', signature: 'POKEPAD_V1' },
    ]);
    await mod.refreshPorts();
    expect(els['port-sel'].appendChild).toHaveBeenCalledTimes(2);
  });

  it('muestra "(Conectado)" en el texto de la opción cuando la firma es Conectado', async () => {
    global.window.arduino.listPorts.mockResolvedValue([
      { path: '/dev/cu.x', signature: 'Conectado' },
    ]);
    await mod.refreshPorts();
    const option = els['port-sel'].appendChild.mock.calls[0][0];
    expect(option.textContent).toContain('(Conectado)');
  });

  it('marca como selected la opción del puerto ya conectado cuando no había selección previa', async () => {
    global.window.arduino.listPorts.mockResolvedValue([
      { path: '/dev/cu.x', signature: 'Conectado' },
    ]);
    els['port-sel'].value = '';
    await mod.refreshPorts();
    const option = els['port-sel'].appendChild.mock.calls[0][0];
    expect(option.selected).toBe(true);
  });

  it('restaura la selección anterior si el mismo path sigue disponible', async () => {
    global.window.arduino.listPorts.mockResolvedValue([
      { path: '/dev/cu.prev', signature: 'POKEPAD_V1' },
    ]);
    els['port-sel'].value = '/dev/cu.prev';
    await mod.refreshPorts();
    const option = els['port-sel'].appendChild.mock.calls[0][0];
    expect(option.selected).toBe(true);
  });
});

// ─── toggleConnect ────────────────────────────────────────────────────────────

describe('toggleConnect', () => {
  it('llama a disconnect cuando ya hay conexión activa', () => {
    state.connected = true;
    mod.toggleConnect();
    expect(global.window.arduino.disconnect).toHaveBeenCalled();
  });

  it('muestra un toast si no hay puerto seleccionado', () => {
    state.connected = false;
    els['port-sel'].value = '';
    mod.toggleConnect();
    expect(showToast).toHaveBeenCalledWith('Sin puerto', expect.any(String));
    expect(global.window.arduino.connect).not.toHaveBeenCalled();
  });

  it('llama a connect con el puerto y baud correctos', () => {
    state.connected = false;
    els['port-sel'].value = '/dev/cu.test';
    els['port-sel'].options = [{ value: '/dev/cu.test', text: 'PokePad (Desconectado)' }];
    els['port-sel'].selectedIndex = 0;
    els['baud-sel'].value = '115200';

    mod.toggleConnect();

    expect(global.window.arduino.connect).toHaveBeenCalledWith('/dev/cu.test', 115200);
  });

  it('no llama a connect cuando no hay puerto aunque baud esté definido', () => {
    state.connected = false;
    els['port-sel'].value = '';
    els['baud-sel'].value = '9600';
    mod.toggleConnect();
    expect(global.window.arduino.connect).not.toHaveBeenCalled();
  });
});

// ─── cancelReconnect ─────────────────────────────────────────────────────────

describe('cancelReconnect', () => {
  it('llama a disconnect', () => {
    mod.cancelReconnect();
    expect(global.window.arduino.disconnect).toHaveBeenCalled();
  });

  it('muestra un toast de cancelación', () => {
    mod.cancelReconnect();
    expect(showToast).toHaveBeenCalledWith('Reconexión cancelada', expect.any(String));
  });
});

// ─── handleConnectionStatus ───────────────────────────────────────────────────

describe('handleConnectionStatus', () => {
  it('actualiza state.connected al valor recibido', () => {
    mod.handleConnectionStatus(true, '/dev/cu.test', 9600, false, 0, 0);
    expect(state.connected).toBe(true);
  });

  it('pone state.connected en false al desconectar', () => {
    state.connected = true;
    mod.handleConnectionStatus(false, null, null, false, 0, 0);
    expect(state.connected).toBe(false);
  });

  it('activa la clase "on" en tb-dot y s-dot al conectar', () => {
    mod.handleConnectionStatus(true, '/dev/cu.test', 9600, false, 0, 0);
    expect(els['tb-dot'].classList.toggle).toHaveBeenCalledWith('on', true);
    expect(els['s-dot'].classList.toggle).toHaveBeenCalledWith('on', true);
  });

  it('desactiva la clase "on" en tb-dot y s-dot al desconectar', () => {
    mod.handleConnectionStatus(false, null, null, false, 0, 0);
    expect(els['tb-dot'].classList.toggle).toHaveBeenCalledWith('on', false);
  });

  it('pone el texto del botón en "Desconectar" al conectar', () => {
    mod.handleConnectionStatus(true, '/dev/cu.test', 9600, false, 0, 0);
    expect(els['btn-conn'].textContent).toBe('Desconectar');
  });

  it('pone el texto del botón en "Conectar" al desconectar', () => {
    mod.handleConnectionStatus(false, null, null, false, 0, 0);
    expect(els['btn-conn'].textContent).toBe('Conectar');
  });

  it('muestra el indicador de reconexión con el progreso correcto', () => {
    mod.handleConnectionStatus(false, null, null, true, 2, 5);
    expect(els['reconnect-indicator'].classList.remove).toHaveBeenCalledWith('d-none');
    expect(els['reconnect-text'].textContent).toBe('Reconectando... (2/5)');
  });

  it('oculta el indicador de reconexión al conectar', () => {
    mod.handleConnectionStatus(true, '/dev/cu.test', 9600, false, 0, 0);
    expect(els['reconnect-indicator'].classList.add).toHaveBeenCalledWith('d-none');
  });

  it('oculta el indicador de reconexión al desconectar sin reconexión activa', () => {
    mod.handleConnectionStatus(false, null, null, false, 0, 0);
    expect(els['reconnect-indicator'].classList.add).toHaveBeenCalledWith('d-none');
  });

  it('pone s-text en "Desconectado" al desconectar', () => {
    mod.handleConnectionStatus(false, null, null, false, 0, 0);
    expect(els['s-text'].textContent).toBe('Desconectado');
  });

  it('registra un mensaje de conexión en el log', () => {
    mod.handleConnectionStatus(true, '/dev/cu.test', 9600, false, 0, 0);
    expect(log).toHaveBeenCalledWith(expect.stringContaining('Conectado'), 'sys');
  });

  it('registra "Desconectado" en el log al perder la conexión sin reconexión', () => {
    mod.handleConnectionStatus(false, null, null, false, 0, 0);
    expect(log).toHaveBeenCalledWith('Desconectado', 'sys');
  });
});
