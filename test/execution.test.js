jest.mock('../main-process/window', () => ({ getWindow: jest.fn(() => null) }));
jest.mock('../main-process/keyboard', () => ({ simulateKey: jest.fn(() => Promise.resolve()) }));
jest.mock('../main-process/media', () => ({ mediaControl: jest.fn(() => Promise.resolve()) }));
jest.mock('os', () => ({ tmpdir: jest.fn(() => '/tmp') }));
jest.mock('fs', () => ({
  mkdirSync: jest.fn(),
  writeFileSync: jest.fn(),
  unlinkSync: jest.fn(),
}));
jest.mock('child_process', () => ({ exec: jest.fn(), execFile: jest.fn() }));

const {
  executeStep,
  runCmd,
  runScript,
  executeSequence,
  setSignalMap,
} = require('../main-process/execution');
const { getWindow } = require('../main-process/window');
const { shell, clipboard } = require('electron');
const { exec, execFile } = require('child_process');
const fs = require('fs');

const MAX_CMD_LENGTH = 4096;

// ─── runCmd ──────────────────────────────────────────────────────────────────

describe('runCmd', () => {
  it('resolves without calling exec when command exceeds MAX_CMD_LENGTH', async () => {
    const longCmd = 'a'.repeat(MAX_CMD_LENGTH + 1);
    await runCmd(longCmd);
    expect(exec).not.toHaveBeenCalled();
  });

  it('resolves (no crash) for a command at exactly MAX_CMD_LENGTH when window is null', async () => {
    exec.mockImplementation((cmd, opts, cb) => cb(null, '', ''));
    const cmd = 'a'.repeat(MAX_CMD_LENGTH);
    await runCmd(cmd);
    expect(exec).toHaveBeenCalledWith(cmd, expect.any(Object), expect.any(Function));
  });

  it('sends action-result with ok:false when exec returns an error', async () => {
    const mockWin = { webContents: { send: jest.fn() } };
    getWindow.mockReturnValue(mockWin);
    exec.mockImplementation((cmd, opts, cb) => cb(new Error('command not found'), '', ''));

    try {
      await runCmd('nonexistent-command');
    } catch (e) {
      expect(e.message).toBe('command not found');
    }

    expect(mockWin.webContents.send).toHaveBeenCalledWith('action-result', expect.objectContaining({
      ok: false,
      cmd: 'nonexistent-command',
    }));
  });

  it('sends action-result with ok:true and stdout on success', async () => {
    const mockWin = { webContents: { send: jest.fn() } };
    getWindow.mockReturnValue(mockWin);
    exec.mockImplementation((cmd, opts, cb) => cb(null, 'hello', ''));

    await runCmd('echo hello');

    expect(mockWin.webContents.send).toHaveBeenCalledWith('action-result', expect.objectContaining({
      ok: true,
      output: 'hello',
    }));
  });
});

// ─── runScript ───────────────────────────────────────────────────────────────

describe('runScript', () => {
  it('resolves without writing files for unsupported language', async () => {
    await runScript('ruby', 'puts "hi"');
    expect(fs.writeFileSync).not.toHaveBeenCalled();
    expect(execFile).not.toHaveBeenCalled();
  });

  it('sends unsupported language error message when window is available', async () => {
    const mockWin = { webContents: { send: jest.fn() } };
    getWindow.mockReturnValue(mockWin);

    await runScript('bash', 'echo hi');

    expect(mockWin.webContents.send).toHaveBeenCalledWith('action-result', expect.objectContaining({
      ok: false,
      output: expect.stringContaining('no soportado'),
    }));
  });

  it('writes a .py file and calls python for lang=python', async () => {
    execFile.mockImplementation((bin, args, opts, cb) => cb(null, 'output', ''));
    await runScript('python', 'print("hi")');
    expect(fs.writeFileSync).toHaveBeenCalledWith(
      expect.stringMatching(/\.py$/),
      'print("hi")',
      expect.objectContaining({ encoding: 'utf-8' })
    );
    expect(execFile).toHaveBeenCalledWith('python', [expect.stringMatching(/\.py$/)], expect.any(Object), expect.any(Function));
  });

  it('writes a .js file and calls node for lang=javascript', async () => {
    execFile.mockImplementation((bin, args, opts, cb) => cb(null, 'output', ''));
    await runScript('javascript', 'console.log("hi")');
    expect(fs.writeFileSync).toHaveBeenCalledWith(
      expect.stringMatching(/\.js$/),
      'console.log("hi")',
      expect.objectContaining({ encoding: 'utf-8' })
    );
    expect(execFile).toHaveBeenCalledWith('node', [expect.stringMatching(/\.js$/)], expect.any(Object), expect.any(Function));
  });

  it('cleans up the temp file after execution', async () => {
    execFile.mockImplementation((bin, args, opts, cb) => cb(null, '', ''));
    await runScript('python', '');
    expect(fs.unlinkSync).toHaveBeenCalled();
  });

  it('reports timeout when exec is killed', async () => {
    const mockWin = { webContents: { send: jest.fn() } };
    getWindow.mockReturnValue(mockWin);
    const killedErr = Object.assign(new Error('killed'), { killed: true });
    execFile.mockImplementation((bin, args, opts, cb) => cb(killedErr, '', ''));

    try {
      await runScript('python', 'import time; time.sleep(999)');
    } catch (e) {
      expect(e.killed).toBe(true);
    }

    expect(mockWin.webContents.send).toHaveBeenCalledWith('action-result', expect.objectContaining({
      ok: false,
      output: 'Script timed out (30s)',
    }));
  });
});

// ─── executeStep – open_url ──────────────────────────────────────────────────

describe('executeStep – open_url', () => {
  it('prepends https:// to a bare domain and opens it', async () => {
    await executeStep({ type: 'open_url', params: { url: 'example.com' } });
    expect(shell.openExternal).toHaveBeenCalledWith(expect.stringContaining('https://example.com'));
  });

  it('passes an http:// URL through unchanged', async () => {
    await executeStep({ type: 'open_url', params: { url: 'http://example.com' } });
    expect(shell.openExternal).toHaveBeenCalledWith(expect.stringContaining('http://example.com'));
  });

  it('passes an https:// URL through unchanged', async () => {
    await executeStep({ type: 'open_url', params: { url: 'https://example.com/path' } });
    expect(shell.openExternal).toHaveBeenCalledWith(expect.stringContaining('https://example.com/path'));
  });

  it('prepends https:// to file:// URIs so they never open local files', async () => {
    // "file:///etc/passwd" doesn't match ^https?://, so https:// is prepended.
    // The resulting URL has protocol https:, preventing filesystem access.
    await executeStep({ type: 'open_url', params: { url: 'file:///etc/passwd' } });
    const opened = shell.openExternal.mock.calls[0][0];
    expect(opened).toMatch(/^https:/);
    expect(opened).not.toMatch(/^file:/);
  });

  it('prepends https:// to other scheme URIs (e.g. ftp://)', async () => {
    // ftp:// doesn't match ^https?://, so https:// is prepended before URL parsing.
    await executeStep({ type: 'open_url', params: { url: 'ftp://server.example.com' } });
    const opened = shell.openExternal.mock.calls[0][0];
    expect(opened).toMatch(/^https:/);
  });

  it('throws for an empty URL', async () => {
    await expect(
      executeStep({ type: 'open_url', params: { url: '' } })
    ).rejects.toThrow('URL inválida');
  });
});

// ─── executeStep – other step types ─────────────────────────────────────────

describe('executeStep – other step types', () => {
  it('writes text to clipboard for clipboard step', async () => {
    await executeStep({ type: 'clipboard', params: { text: 'hello world' } });
    expect(clipboard.writeText).toHaveBeenCalledWith('hello world');
  });

  it('defaults to empty string for clipboard step with no text', async () => {
    await executeStep({ type: 'clipboard', params: {} });
    expect(clipboard.writeText).toHaveBeenCalledWith('');
  });

  it('waits approximately the specified milliseconds', async () => {
    const start = Date.now();
    await executeStep({ type: 'wait', params: { ms: '50' } });
    expect(Date.now() - start).toBeGreaterThanOrEqual(40);
  });

  it('uses default 100ms for invalid wait duration', async () => {
    const start = Date.now();
    await executeStep({ type: 'wait', params: { ms: 'notanumber' } });
    expect(Date.now() - start).toBeGreaterThanOrEqual(90);
  });

  it('throws for open_file with empty path', async () => {
    await expect(
      executeStep({ type: 'open_file', params: { path: '' } })
    ).rejects.toThrow('Ruta vacía');
  });

  it('does not crash for notify step when Notification is not supported', async () => {
    await expect(
      executeStep({ type: 'notify', params: { title: 'Test', body: 'msg' } })
    ).resolves.toBeUndefined();
  });
});

// ─── executeSequence ────────────────────────────────────────────────────────

describe('executeSequence', () => {
  beforeEach(() => {
    setSignalMap({});
  });

  it('returns early when signal is not in the map', async () => {
    await executeSequence('UNKNOWN');
    expect(clipboard.writeText).not.toHaveBeenCalled();
  });

  it('returns early when signal has no steps', async () => {
    setSignalMap({ SIG: { steps: [] } });
    await executeSequence('SIG');
    expect(clipboard.writeText).not.toHaveBeenCalled();
  });

  it('executes steps for a known signal', async () => {
    setSignalMap({
      SIG: { steps: [{ type: 'clipboard', params: { text: 'executed' } }] },
    });
    await executeSequence('SIG');
    expect(clipboard.writeText).toHaveBeenCalledWith('executed');
  });

  it('ejecuta la señal asignada al botón cuando llega RAPIDA, MEDIA o LENTA', async () => {
    setSignalMap({
      Fast: {
        assignedToButton: ['RAPIDA'],
        steps: [{ type: 'clipboard', params: { text: 'fast' } }],
      },
      Medium: {
        assignedToButton: ['MEDIA'],
        steps: [{ type: 'clipboard', params: { text: 'medium' } }],
      },
      Slow: {
        assignedToButton: ['LENTA'],
        steps: [{ type: 'clipboard', params: { text: 'slow' } }],
      },
    });

    await executeSequence('RAPIDA');
    expect(clipboard.writeText).toHaveBeenCalledWith('fast');

    await executeSequence('MEDIA');
    expect(clipboard.writeText).toHaveBeenCalledWith('medium');

    await executeSequence('LENTA');
    expect(clipboard.writeText).toHaveBeenCalledWith('slow');
  });

  it('ejecuta la señal cuando tiene múltiples velocidades asignadas', async () => {
    setSignalMap({
      Multi: {
        assignedToButton: ['RAPIDA', 'MEDIA'],
        steps: [{ type: 'clipboard', params: { text: 'multi' } }],
      },
    });

    await executeSequence('RAPIDA');
    expect(clipboard.writeText).toHaveBeenCalledWith('multi');

    await executeSequence('MEDIA');
    expect(clipboard.writeText).toHaveBeenCalledWith('multi');
  });

  it('no hace nada con señales de velocidad cuando ninguna señal las tiene asignadas', async () => {
    setSignalMap({
      SIG: { assignedToButton: [], steps: [{ type: 'clipboard', params: { text: 'nope' } }] },
    });
    await executeSequence('RAPIDA');
    await executeSequence('MEDIA');
    await executeSequence('LENTA');
    expect(clipboard.writeText).not.toHaveBeenCalled();
  });

  it('prevents concurrent execution of the same signal', async () => {
    setSignalMap({
      SIG: { steps: [{ type: 'clipboard', params: { text: 'once' } }] },
    });
    // Both calls start synchronously; the guard fires before the first await yields
    const p1 = executeSequence('SIG');
    const p2 = executeSequence('SIG');
    await Promise.all([p1, p2]);
    expect(clipboard.writeText).toHaveBeenCalledTimes(1);
  });

  it('allows the same signal to run again after the first run completes', async () => {
    setSignalMap({
      SIG: { steps: [{ type: 'clipboard', params: { text: 'run' } }] },
    });
    await executeSequence('SIG');
    await executeSequence('SIG');
    expect(clipboard.writeText).toHaveBeenCalledTimes(2);
  });

  it('correctly mutates variables inside a loop', async () => {
    const mockWin = { webContents: { send: jest.fn() } };
    getWindow.mockReturnValue(mockWin);

    setSignalMap({
      MUTATE_LOOP: {
        steps: [
          { type: 'set_variable', params: { name: 'hola', type: 'int', value: '1' } },
          { 
            type: 'loop', 
            params: { 
              iterations: '5', 
              steps: [
                { type: 'modify_variable', params: { name: 'hola', op: 'add', value: '1' } }
              ] 
            } 
          },
          { type: 'clipboard', params: { text: '$hola' } }
        ]
      }
    });

    await executeSequence('MUTATE_LOOP');
    expect(clipboard.writeText).toHaveBeenCalledWith('6');
  });

  it('interpolates numeric variables in commands', async () => {
    const mockWin = { webContents: { send: jest.fn() } };
    getWindow.mockReturnValue(mockWin);
    exec.mockImplementation((cmd, opts, cb) => cb(null, cmd, ''));

    setSignalMap({
      ECHO_VAR: {
        steps: [
          { type: 'set_variable', params: { name: 'val', type: 'int', value: '10' } },
          { type: 'run_cmd', params: { cmd: 'echo $val' } }
        ]
      }
    });

    await executeSequence('ECHO_VAR');
    expect(mockWin.webContents.send).toHaveBeenCalledWith('action-result', expect.objectContaining({
      output: 'echo 10'
    }));
  });

  it('handles loop iterations from a variable', async () => {
    setSignalMap({
      VAR_LOOP: {
        steps: [
          { type: 'set_variable', params: { name: 'count', type: 'int', value: '3' } },
          { type: 'set_variable', params: { name: 'target', type: 'int', value: '0' } },
          { 
            type: 'loop', 
            params: { 
              iterations: '$count', 
              steps: [
                { type: 'modify_variable', params: { name: 'target', op: 'add', value: '1' } }
              ] 
            } 
          },
          { type: 'clipboard', params: { text: '$target' } }
        ]
      }
    });

    await executeSequence('VAR_LOOP');
    expect(clipboard.writeText).toHaveBeenCalledWith('3');
  });

  it('handles variable comparison in conditions', async () => {
    setSignalMap({
      COND_VAR: {
        steps: [
          { type: 'set_variable', params: { name: 'a', type: 'int', value: '5' } },
          { type: 'set_variable', params: { name: 'b', type: 'int', value: '10' } },
          { 
            type: 'condition', 
            params: { 
              type: 'var_cmp', var1: '$a', op: '<', var2: '$b',
              steps: [
                { type: 'clipboard', params: { text: 'less' } }
              ] 
            } 
          }
        ]
      }
    });

    await executeSequence('COND_VAR');
    expect(clipboard.writeText).toHaveBeenCalledWith('less');
  });

  it('mimics user scenario precisely: hola=1, loop 5 times +1, result=6', async () => {
    setSignalMap({
      USER: {
        steps: [
          { type: 'set_variable', params: { name: 'hola', type: 'int', value: '1' } },
          { 
            type: 'loop', 
            params: { 
              mode: 'count',
              iterations: '5', 
              steps: [
                { type: 'modify_variable', params: { name: 'hola', op: 'add', value: '1' } }
              ] 
            } 
          },
          { type: 'clipboard', params: { text: 'Valor: $hola' } }
        ]
      }
    });
    await executeSequence('USER');
    expect(clipboard.writeText).toHaveBeenCalledWith('Valor: 6');
  });

  it('handles foreach loops correctly', async () => {
    setSignalMap({
      FOREACH: {
        steps: [
          { type: 'set_variable', params: { name: 'items', type: 'list', value: '["a", "b"]' } },
          { 
            type: 'loop', 
            params: { 
              mode: 'foreach', list_name: 'items', var_name: 'item',
              steps: [
                { type: 'clipboard', params: { text: '$item' } }
              ] 
            } 
          }
        ]
      }
    });
    await executeSequence('FOREACH');
    expect(clipboard.writeText).toHaveBeenCalledWith('a');
    expect(clipboard.writeText).toHaveBeenCalledWith('b');
  });

  it('auto-quotes string variables in interpolation if not already quoted', async () => {
    setSignalMap({
      SMART_QUOTE: {
        steps: [
          { type: 'set_variable', params: { name: 'msg', value: 'hello world' } },
          { type: 'clipboard', params: { text: 'Text: $msg' } },
          { type: 'set_variable', params: { name: 'quoted', value: 'fixed' } },
          { type: 'clipboard', params: { text: 'Quoted: "$quoted"' } }
        ]
      }
    });
    await executeSequence('SMART_QUOTE');
    // hello world becomes "hello world"
    expect(clipboard.writeText).toHaveBeenCalledWith('Text: "hello world"');
    // "fixed" remains "fixed" (no double quotes)
    expect(clipboard.writeText).toHaveBeenCalledWith('Quoted: "fixed"');
  });
});
