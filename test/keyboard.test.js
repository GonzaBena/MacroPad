jest.mock('../main-process/window', () => ({ getWindow: jest.fn() }));
jest.mock('child_process', () => ({ exec: jest.fn(), execFile: jest.fn() }));
jest.mock('@nut-tree-fork/nut-js', () => ({
  keyboard: {
    pressKey: jest.fn().mockResolvedValue(undefined),
    releaseKey: jest.fn().mockResolvedValue(undefined),
  },
  Key: {
    A: 'A',
    B: 'B',
    LeftSuper: 'LeftSuper',
    LeftControl: 'LeftControl',
    LeftAlt: 'LeftAlt',
    LeftShift: 'LeftShift',
  }
}), { virtual: true });

const { escapePowerShell, simulateKey } = require('../main-process/keyboard');
const { getWindow } = require('../main-process/window');
const { exec, execFile } = require('child_process');

// ─── escapePowerShell ────────────────────────────────────────────────────────

describe('escapePowerShell', () => {
  it('passes through clean alphanumeric input unchanged', () => {
    expect(escapePowerShell('abc123')).toBe('abc123');
    expect(escapePowerShell('ABC')).toBe('ABC');
  });

  it('preserves allowed special characters: + - _ and space', () => {
    expect(escapePowerShell('ctrl+alt+del')).toBe('ctrl+alt+del');
    expect(escapePowerShell('vol-down')).toBe('vol-down');
    expect(escapePowerShell('my key')).toBe('my key');
    expect(escapePowerShell('under_score')).toBe('under_score');
  });

  it('strips shell-injection characters', () => {
    expect(escapePowerShell('a;b')).toBe('ab');
    expect(escapePowerShell("a'b")).toBe('ab');
    expect(escapePowerShell('a"b')).toBe('ab');
    expect(escapePowerShell('a`b')).toBe('ab');
    expect(escapePowerShell('a$b')).toBe('ab');
    expect(escapePowerShell('a(b)')).toBe('ab');
    expect(escapePowerShell('a|b')).toBe('ab');
    expect(escapePowerShell('a&b')).toBe('ab');
  });

  it('strips all non-allowed chars from a crafted injection payload', () => {
    const malicious = '$(rm -rf /); echo pwned';
    const safe = escapePowerShell(malicious);
    expect(safe).not.toContain('$');
    expect(safe).not.toContain(';');
    expect(safe).not.toContain('(');
    expect(safe).not.toContain(')');
  });

  it('returns an empty string for empty input', () => {
    expect(escapePowerShell('')).toBe('');
  });
});

// ─── simulateKey – validation paths ─────────────────────────────────────────

describe('simulateKey', () => {
  let mockWin;

  beforeEach(() => {
    mockWin = { webContents: { send: jest.fn() } };
    getWindow.mockReturnValue(mockWin);
  });

  it('resolves immediately for an empty combo without calling exec', async () => {
    await simulateKey('');
    expect(exec).not.toHaveBeenCalled();
    expect(execFile).not.toHaveBeenCalled();
  });

  it('sends serial-error and resolves for a key with invalid characters', async () => {
    await simulateKey('ctrl+../../etc/passwd');
    expect(mockWin.webContents.send).toHaveBeenCalledWith(
      'serial-error',
      expect.stringContaining('inválida')
    );
    expect(exec).not.toHaveBeenCalled();
    expect(execFile).not.toHaveBeenCalled();
  });

  it('sends serial-error and resolves for an unrecognised modifier', async () => {
    await simulateKey('super+a');
    expect(mockWin.webContents.send).toHaveBeenCalledWith(
      'serial-error',
      expect.stringContaining('Modificador inválido')
    );
    expect(exec).not.toHaveBeenCalled();
    expect(execFile).not.toHaveBeenCalled();
  });

  it('accepts all valid modifiers without errors', async () => {
    // On any platform the validation happens before the platform branch.
    // Mock exec/execFile so the platform call does not throw.
    exec.mockImplementation((cmd, cb) => cb(null));
    execFile.mockImplementation((bin, args, cb) => cb(null));

    for (const mod of ['cmd', 'ctrl', 'alt', 'shift']) {
      mockWin.webContents.send.mockClear();
      await simulateKey(`${mod}+a`);
      const errorCalls = mockWin.webContents.send.mock.calls.filter(
        (c) => c[0] === 'serial-error'
      );
      expect(errorCalls).toHaveLength(0);
    }
  });
});
