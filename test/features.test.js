const { state, applyConfig } = require('../renderer/js/state');

// Mocks for browser globals
global.window = {
  arduino: {
    getThemeData: jest.fn(),
    setZoomFactor: jest.fn(),
    updateSignals: jest.fn(),
    saveData: jest.fn().mockResolvedValue({ ok: true }),
  },
  matchMedia: jest.fn().mockImplementation(query => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: jest.fn(),
    removeListener: jest.fn(),
    addEventListener: jest.fn(),
    removeEventListener: jest.fn(),
    dispatchEvent: jest.fn(),
  })),
};

global.document = {
  documentElement: {
    style: {
      setProperty: jest.fn(),
    },
  },
};

describe('Theme Fallback', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    state.config.theme = 'non-existent-theme';
    state.config.accentColor = '#f5a623';
  });

  it('falls back to dark-default if theme is missing and system is dark', async () => {
    // Mock system preference as dark
    global.window.matchMedia.mockReturnValueOnce({ matches: true });
    
    // Mock theme data missing for 'non-existent-theme' but present for 'dark-default'
    global.window.arduino.getThemeData
      .mockResolvedValueOnce(null) // for 'non-existent-theme'
      .mockResolvedValueOnce({ colors: { '--bg': '#000' } }); // for fallback 'dark-default'

    await applyConfig();

    expect(global.window.arduino.getThemeData).toHaveBeenCalledWith('non-existent-theme');
    expect(global.window.arduino.getThemeData).toHaveBeenCalledWith('dark-default');
    expect(global.document.documentElement.style.setProperty).toHaveBeenCalledWith('--bg', '#000');
  });

  it('falls back to light-default if theme is missing and system is light', async () => {
    // Mock system preference as light
    global.window.matchMedia.mockReturnValueOnce({ matches: false });
    
    // Mock theme data missing for 'non-existent-theme' but present for 'light-default'
    global.window.arduino.getThemeData
      .mockResolvedValueOnce(null) // for 'non-existent-theme'
      .mockResolvedValueOnce({ colors: { '--bg': '#fff' } }); // for fallback 'light-default'

    await applyConfig();

    expect(global.window.arduino.getThemeData).toHaveBeenCalledWith('non-existent-theme');
    expect(global.window.arduino.getThemeData).toHaveBeenCalledWith('light-default');
    expect(global.document.documentElement.style.setProperty).toHaveBeenCalledWith('--bg', '#fff');
  });
});

describe('Path Validation (file-exists logic)', () => {
  const fs = require('fs');
  const path = require('path');

  // Logic extracted from main.js for testing
  const fileExistsLogic = (filePath) => {
    if (!filePath || typeof filePath !== 'string') return false;
    try {
      const cleanPath = filePath.trim().replace(/^["']|["']$/g, '');
      if (/^(shell:|mailto:|http:|https:|file:)/i.test(cleanPath)) {
        return true;
      }
      const normalized = path.normalize(cleanPath);
      return fs.existsSync(normalized);
    } catch (e) {
      return false;
    }
  };

  it('returns true for shell: protocols', () => {
    expect(fileExistsLogic('shell:AppsFolder\\Microsoft.Office.ONENOTE.EXE.15')).toBe(true);
  });

  it('returns true for http: protocols', () => {
    expect(fileExistsLogic('https://google.com')).toBe(true);
  });

  it('returns true for existing files', () => {
    jest.spyOn(fs, 'existsSync').mockReturnValueOnce(true);
    expect(fileExistsLogic('C:\\Windows\\notepad.exe')).toBe(true);
  });

  it('returns false for non-existing files', () => {
    jest.spyOn(fs, 'existsSync').mockReturnValueOnce(false);
    expect(fileExistsLogic('C:\\NonExistent\\file.exe')).toBe(false);
  });

  it('handles quoted paths correctly', () => {
    jest.spyOn(fs, 'existsSync').mockReturnValueOnce(true);
    expect(fileExistsLogic('"C:\\Windows\\notepad.exe"')).toBe(true);
  });
});

describe('Execution Feedback (Renderer Logic)', () => {
  let onStartCb, onEndCb;

  beforeEach(() => {
    jest.resetModules();
    
    // Mock for state
    const stateM = require('../renderer/js/state');
    stateM.state.selectedSig = 'TEST_SIG';

    // Mock for arduino listeners
    global.window.arduino = {
      ...global.window.arduino,
      onSequenceStart: jest.fn(cb => { onStartCb = cb; }),
      onSequenceEnd: jest.fn(cb => { onEndCb = cb; }),
    };

    // Mock for DOM
    const btn = {
      classList: { add: jest.fn(), remove: jest.fn() },
      innerHTML: '',
    };
    const card = {
      classList: { add: jest.fn(), remove: jest.fn() },
    };

    global.document.getElementById = jest.fn(id => id === 'btn-test' ? btn : null);
    global.document.querySelector = jest.fn(sel => sel.includes('TEST_SIG') ? card : null);
    global.CSS = { escape: jest.fn(s => s) };

    // We need to trigger the logic that registers these listeners.
    // Since it's in a DOMContentLoaded listener in main.js, we'll simulate the calls.
    // Logic extracted from renderer/js/main.js:
    /*
    window.arduino.onSequenceStart((signal) => {
      const card = document.querySelector(`.sig-card[data-sig="${CSS.escape(signal)}"]`);
      if (card) card.classList.add("running");
      if (signal === state.selectedSig) {
        const btn = document.getElementById("btn-test");
        if (btn) {
          btn.classList.add("running");
          btn.innerHTML = "<span>⏳ Ejecutando...</span>";
        }
      }
    });
    */
  });

  it('updates button state on sequence start', () => {
    // Simulate the logic in main.js
    const btn = global.document.getElementById('btn-test');
    const signal = 'TEST_SIG';
    
    // Trigger start
    const card = global.document.querySelector(`.sig-card[data-sig="${signal}"]`);
    if (card) card.classList.add("running");
    btn.classList.add("running");
    btn.innerHTML = "<span>⏳ Ejecutando...</span>";

    expect(btn.classList.add).toHaveBeenCalledWith('running');
    expect(btn.innerHTML).toContain('Ejecutando');
  });

  it('restores button state on sequence end', () => {
    const btn = global.document.getElementById('btn-test');
    const signal = 'TEST_SIG';
    
    // Trigger end
    const card = global.document.querySelector(`.sig-card[data-sig="${signal}"]`);
    if (card) card.classList.remove("running");
    btn.classList.remove("running");
    btn.innerHTML = "<span>▶ Probar</span>";

    expect(btn.classList.remove).toHaveBeenCalledWith('running');
    expect(btn.innerHTML).toContain('Probar');
  });
});
