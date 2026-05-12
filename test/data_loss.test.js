
let state, saveSignals, saveConfig;

beforeEach(() => {
  jest.resetModules();

  global.window = {
    arduino: {
      saveData: jest.fn(),
      updateSignals: jest.fn(),
      updateGlobalVars: jest.fn(),
      loadData: jest.fn(() => Promise.resolve(null)),
      getThemeData: jest.fn(() => Promise.resolve({ colors: {} })),
      setZoomFactor: jest.fn(),
    },
    matchMedia: jest.fn(() => ({ matches: true })),
  };

  global.localStorage = {
    setItem: jest.fn(),
    getItem: jest.fn(() => null),
  };

  global.document = {
    documentElement: { style: { setProperty: jest.fn() } },
    dispatchEvent: jest.fn(),
    getElementById: jest.fn(() => ({ classList: { add: jest.fn(), remove: jest.fn() } })),
  };

  global.CustomEvent = class { constructor(n) { this.name = n; } };

  const m = require('../renderer/js/state');
  state = m.state;
  saveSignals = m.saveSignals;
  saveConfig = m.saveConfig;
});

describe('Data Loss Prevention', () => {
  it('saveSignals includes all state fields', () => {
    state.signals = { sig1: { label: 'test' } };
    state.globalVariables = { var1: 'val1' };
    state.stats = { sig: 10 };
    state.history = ['log1'];
    state.config.theme = 'custom-theme';

    saveSignals();

    expect(global.window.arduino.saveData).toHaveBeenCalledWith(expect.objectContaining({
      signals: state.signals,
      globalVariables: state.globalVariables,
      stats: state.stats,
      history: state.history,
      config: state.config,
    }));
  });

  it('saveConfig includes all state fields', async () => {
    state.signals = { sig1: { label: 'test' } };
    state.globalVariables = { var1: 'val1' };
    state.stats = { sig: 10 };
    state.history = ['log1'];
    state.config.theme = 'custom-theme';

    await saveConfig();

    expect(global.window.arduino.saveData).toHaveBeenCalledWith(expect.objectContaining({
      signals: state.signals,
      globalVariables: state.globalVariables,
      stats: state.stats,
      history: state.history,
      config: state.config,
    }));
  });

  it('applyConfig fallback includes all state fields', async () => {
    state.globalVariables = { var1: 'val1' };
    state.config.theme = 'non-existent';
    
    // Mock getThemeData to return null for the first call (non-existent)
    // and a valid theme for the fallback call
    global.window.arduino.getThemeData
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ colors: {} });

    const { applyConfig } = require('../renderer/js/state');
    await applyConfig();

    expect(global.window.arduino.saveData).toHaveBeenCalledWith(expect.objectContaining({
      globalVariables: state.globalVariables,
      config: expect.objectContaining({ theme: expect.any(String) }),
    }));
  });
});
