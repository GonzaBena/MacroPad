jest.mock('../main-process/window', () => ({ getWindow: jest.fn(() => null) }));

const { validateData, loadData, saveData } = require('../main-process/persistence');
const fs = require('fs');

// ─── validateData ───────────────────────────────────────────────────────────

describe('validateData', () => {
  const defaults = {
    signals: {},
    config: { theme: 'dark', closeBehavior: 'close', accentColor: '#f5a623' },
  };

  it('returns defaults for null input', () => {
    expect(validateData(null)).toEqual(defaults);
  });

  it('returns defaults for non-object input', () => {
    expect(validateData('string')).toEqual(defaults);
    expect(validateData(42)).toEqual(defaults);
    expect(validateData([])).toEqual(defaults);
  });

  it('returns defaults for empty object', () => {
    expect(validateData({})).toEqual(defaults);
  });

  it('preserves valid config fields', () => {
    const raw = { config: { theme: 'light', closeBehavior: 'tray', accentColor: '#3ddc84' } };
    const result = validateData(raw);
    expect(result.config.theme).toBe('light');
    expect(result.config.closeBehavior).toBe('tray');
    expect(result.config.accentColor).toBe('#3ddc84');
  });

  it('accepts any valid 6-digit hex accent color', () => {
    expect(validateData({ config: { accentColor: '#000000' } }).config.accentColor).toBe('#000000');
    expect(validateData({ config: { accentColor: '#ABCDEF' } }).config.accentColor).toBe('#ABCDEF');
    expect(validateData({ config: { accentColor: '#a1b2c3' } }).config.accentColor).toBe('#a1b2c3');
  });

  it('falls back to default for invalid accent color formats', () => {
    const bad = ['red', '#gg0000', '#12345', '#1234567', '', 'rgb(0,0,0)', null, 123];
    for (const color of bad) {
      const result = validateData({ config: { accentColor: color } });
      expect(result.config.accentColor).toBe('#f5a623');
    }
  });

  it('ignores config fields with wrong types', () => {
    const raw = { config: { theme: 42, closeBehavior: true } };
    const result = validateData(raw);
    expect(result.config.theme).toBe('dark');
    expect(result.config.closeBehavior).toBe('close');
  });

  it('skips signal entries that are not objects', () => {
    const raw = { signals: { a: null, b: 'string', c: 42 } };
    const result = validateData(raw);
    expect(result.signals).toEqual({});
  });

  it('preserves valid signal entries', () => {
    const raw = {
      signals: {
        SIG1: { label: 'My Signal', color: '#ff0000', steps: [], assignedToButton: false },
      },
    };
    const result = validateData(raw);
    expect(result.signals.SIG1.label).toBe('My Signal');
    expect(result.signals.SIG1.color).toBe('#ff0000');
    expect(result.signals.SIG1.steps).toEqual([]);
    expect(result.signals.SIG1.assignedToButton).toBe(false);
  });

  it('filters out step entries missing a type field', () => {
    const raw = {
      signals: {
        SIG1: {
          label: '',
          steps: [
            { type: 'keypress', params: {} },
            { params: {} },            // no type → filtered
            null,                      // null → filtered
            { type: 'wait', params: {} },
          ],
        },
      },
    };
    const result = validateData(raw);
    expect(result.signals.SIG1.steps).toHaveLength(2);
    expect(result.signals.SIG1.steps[0].type).toBe('keypress');
    expect(result.signals.SIG1.steps[1].type).toBe('wait');
  });

  it('coerces assignedToButton strictly to boolean', () => {
    // Only true literal is accepted, truthy values like 1 or "yes" become false
    expect(validateData({ signals: { s: { assignedToButton: true } } }).signals.s.assignedToButton).toBe(true);
    expect(validateData({ signals: { s: { assignedToButton: 1 } } }).signals.s.assignedToButton).toBe(false);
    expect(validateData({ signals: { s: { assignedToButton: 'yes' } } }).signals.s.assignedToButton).toBe(false);
    expect(validateData({ signals: { s: { assignedToButton: false } } }).signals.s.assignedToButton).toBe(false);
  });

  it('defaults missing signal fields to safe values', () => {
    const raw = { signals: { s: {} } };
    const result = validateData(raw);
    expect(result.signals.s.label).toBe('');
    expect(result.signals.s.color).toBe('#f5a623');
    expect(result.signals.s.steps).toEqual([]);
    expect(result.signals.s.assignedToButton).toBe(false);
  });
});

// ─── loadData ────────────────────────────────────────────────────────────────

describe('loadData', () => {
  let existsSyncSpy;
  let readFileSyncSpy;

  beforeEach(() => {
    existsSyncSpy = jest.spyOn(fs, 'existsSync');
    readFileSyncSpy = jest.spyOn(fs, 'readFileSync');
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('returns defaults when neither data file nor backup exists', () => {
    existsSyncSpy.mockReturnValue(false);
    const data = loadData();
    expect(data.signals).toEqual({});
    expect(data.config.theme).toBe('dark');
  });

  it('loads and validates the main data file', () => {
    const stored = {
      signals: { SIG1: { label: 'Test', color: '#f5a623', steps: [], assignedToButton: false } },
      config: { theme: 'light', closeBehavior: 'tray', accentColor: '#3ddc84' },
    };
    existsSyncSpy.mockReturnValue(true);
    readFileSyncSpy.mockReturnValue(JSON.stringify(stored));
    const data = loadData();
    expect(data.signals.SIG1.label).toBe('Test');
    expect(data.config.theme).toBe('light');
  });

  it('falls back to backup when main file contains invalid JSON', () => {
    const backup = {
      signals: { BKP: { label: 'Backup', color: '#f5a623', steps: [], assignedToButton: false } },
      config: { theme: 'dark', closeBehavior: 'close', accentColor: '#f5a623' },
    };
    existsSyncSpy.mockReturnValue(true);
    readFileSyncSpy
      .mockReturnValueOnce('{ this is not json !!!') // main file
      .mockReturnValueOnce(JSON.stringify(backup));   // backup
    const data = loadData();
    expect(data.signals.BKP).toBeDefined();
    expect(data.signals.BKP.label).toBe('Backup');
  });

  it('returns defaults when both files are corrupt', () => {
    existsSyncSpy.mockReturnValue(true);
    readFileSyncSpy.mockReturnValue('not json');
    const data = loadData();
    expect(data.signals).toEqual({});
    expect(data.config.theme).toBe('dark');
  });
});

// ─── saveData ────────────────────────────────────────────────────────────────

describe('saveData', () => {
  let existsSyncSpy;
  let copyFileSyncSpy;
  let writeFileSyncSpy;

  beforeEach(() => {
    existsSyncSpy = jest.spyOn(fs, 'existsSync');
    copyFileSyncSpy = jest.spyOn(fs, 'copyFileSync').mockImplementation(() => {});
    writeFileSyncSpy = jest.spyOn(fs, 'writeFileSync').mockImplementation(() => {});
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('rotates the main file to backup before writing', () => {
    existsSyncSpy.mockReturnValue(true);
    saveData({ signals: {}, config: { theme: 'dark', closeBehavior: 'close', accentColor: '#f5a623' } });
    expect(copyFileSyncSpy).toHaveBeenCalledWith(
      expect.stringContaining('pokepad-data.json'),
      expect.stringContaining('pokepad-data.bak.json')
    );
  });

  it('skips backup rotation when main file does not exist', () => {
    existsSyncSpy.mockReturnValue(false);
    saveData({ signals: {}, config: { theme: 'dark', closeBehavior: 'close', accentColor: '#f5a623' } });
    expect(copyFileSyncSpy).not.toHaveBeenCalled();
  });

  it('writes validated data as formatted JSON', () => {
    existsSyncSpy.mockReturnValue(false);
    const input = { signals: {}, config: { theme: 'light', closeBehavior: 'tray', accentColor: '#3ddc84' } };
    saveData(input);
    expect(writeFileSyncSpy).toHaveBeenCalled();
    const written = JSON.parse(writeFileSyncSpy.mock.calls[0][1]);
    expect(written.config.theme).toBe('light');
  });

  it('strips invalid data before writing', () => {
    existsSyncSpy.mockReturnValue(false);
    saveData({ signals: { s: null }, config: { accentColor: 'not-a-hex' } });
    const written = JSON.parse(writeFileSyncSpy.mock.calls[0][1]);
    expect(written.signals).toEqual({});
    expect(written.config.accentColor).toBe('#f5a623');
  });
});
