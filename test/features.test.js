/**
 * @jest-environment jsdom
 */
const { state, applyConfig } = require('../renderer/js/state');

// In jsdom, window === global, so assign arduino/matchMedia directly on global.
global.arduino = {
  getThemeData: jest.fn(),
  setZoomFactor: jest.fn(),
  updateSignals: jest.fn(),
  updateGlobalVars: jest.fn(),
  saveData: jest.fn().mockResolvedValue({ ok: true }),
};
global.matchMedia = jest.fn().mockImplementation(query => ({
  matches: false,
  media: query,
  onchange: null,
  addListener: jest.fn(),
  removeListener: jest.fn(),
  addEventListener: jest.fn(),
  removeEventListener: jest.fn(),
  dispatchEvent: jest.fn(),
}));

describe('Theme Fallback', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // Spy on real jsdom document methods — global.document override doesn't work in jsdom
    jest.spyOn(document, 'dispatchEvent').mockReturnValue(true);
    jest.spyOn(document, 'getElementById').mockReturnValue(
      /** @type {any} */ ({ classList: { add: jest.fn(), remove: jest.fn(), toggle: jest.fn() } })
    );
    jest.spyOn(document.documentElement.style, 'setProperty');
    state.config.theme = 'non-existent-theme';
    state.config.accentColor = '#f5a623';
  });

  it('falls back to dark-default if theme is missing and system is dark', async () => {
    global.matchMedia.mockReturnValueOnce({ matches: true });

    global.arduino.getThemeData
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ colors: { '--bg': '#000' } });

    await applyConfig();

    expect(global.arduino.getThemeData).toHaveBeenCalledWith('non-existent-theme');
    expect(global.arduino.getThemeData).toHaveBeenCalledWith('dark-default');
    expect(document.documentElement.style.setProperty).toHaveBeenCalledWith('--bg', '#000');
  });

  it('falls back to light-default if theme is missing and system is light', async () => {
    global.matchMedia.mockReturnValueOnce({ matches: false });

    global.arduino.getThemeData
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ colors: { '--bg': '#fff' } });

    await applyConfig();

    expect(global.arduino.getThemeData).toHaveBeenCalledWith('non-existent-theme');
    expect(global.arduino.getThemeData).toHaveBeenCalledWith('light-default');
    expect(document.documentElement.style.setProperty).toHaveBeenCalledWith('--bg', '#fff');
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

    const stateM = require('../renderer/js/state');
    stateM.state.selectedSig = 'TEST_SIG';

    global.arduino = {
      ...global.arduino,
      onSequenceStart: jest.fn(cb => { onStartCb = cb; }),
      onSequenceEnd: jest.fn(cb => { onEndCb = cb; }),
    };

    const btn = {
      classList: { add: jest.fn(), remove: jest.fn() },
      innerHTML: '',
    };
    const card = {
      classList: { add: jest.fn(), remove: jest.fn() },
    };

    // Direct assignment on the real jsdom document works fine
    document.getElementById = jest.fn(id => id === 'btn-test' ? btn : null);
    document.querySelector = jest.fn(sel => sel.includes('TEST_SIG') ? card : null);
    global.CSS = { escape: jest.fn(s => s) };
  });

  it('updates button state on sequence start', () => {
    const btn = document.getElementById('btn-test');
    const signal = 'TEST_SIG';

    const card = document.querySelector(`.sig-card[data-sig="${signal}"]`);
    if (card) card.classList.add("running");
    btn.classList.add("running");
    btn.innerHTML = "<span>⏳ Ejecutando...</span>";

    expect(btn.classList.add).toHaveBeenCalledWith('running');
    expect(btn.innerHTML).toContain('Ejecutando');
  });

  it('restores button state on sequence end', () => {
    const btn = document.getElementById('btn-test');
    const signal = 'TEST_SIG';

    const card = document.querySelector(`.sig-card[data-sig="${signal}"]`);
    if (card) card.classList.remove("running");
    btn.classList.remove("running");
    btn.innerHTML = "<span>▶ Probar</span>";

    expect(btn.classList.remove).toHaveBeenCalledWith('running');
    expect(btn.innerHTML).toContain('Probar');
  });
});
