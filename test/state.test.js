/**
 * @jest-environment jsdom
 */
// state.js uses ES module syntax (export/import); babel-jest transpiles it to CommonJS.
// window.arduino and localStorage are browser globals — we mock them manually.

let state, pushUndo, undo, redo, canUndo, canRedo;

beforeEach(() => {
  // Reset module registry so each test starts with a fresh module state
  // (undoStack / redoStack are module-level, not exported).
  jest.resetModules();

  global.arduino = {
    saveData: jest.fn(),
    updateSignals: jest.fn(),
    updateGlobalVars: jest.fn(),
    loadData: jest.fn(() => Promise.resolve(null)),
    getThemeData: jest.fn(() => Promise.resolve({ colors: {} })),
    setZoomFactor: jest.fn(),
  };
  global.matchMedia = jest.fn(() => ({ matches: true }));

  global.localStorage = {
    setItem: jest.fn(),
    getItem: jest.fn(() => null),
  };

  jest.spyOn(document, 'dispatchEvent').mockReturnValue(true);
  jest.spyOn(document, 'getElementById').mockReturnValue(
    /** @type {any} */ ({ classList: { add: jest.fn(), remove: jest.fn(), toggle: jest.fn() } })
  );

  const m = require('../renderer/js/state');
  state = m.state;
  pushUndo = m.pushUndo;
  undo = m.undo;
  redo = m.redo;
  canUndo = m.canUndo;
  canRedo = m.canRedo;
});

// ─── canUndo / canRedo on fresh state ────────────────────────────────────────

describe('initial state', () => {
  it('canUndo() is false on a fresh module', () => {
    expect(canUndo()).toBe(false);
  });

  it('canRedo() is false on a fresh module', () => {
    expect(canRedo()).toBe(false);
  });
});

// ─── pushUndo ────────────────────────────────────────────────────────────────

describe('pushUndo', () => {
  it('makes canUndo() true', () => {
    pushUndo();
    expect(canUndo()).toBe(true);
  });

  it('clears the redo stack', () => {
    // Arrange: get something in the redo stack via undo
    state.signals = { a: { label: 'first', steps: [] } };
    pushUndo();
    state.signals = { b: { label: 'second', steps: [] } };
    undo(); // redo stack now has 'second'
    expect(canRedo()).toBe(true);

    // Act
    pushUndo();

    // Assert
    expect(canRedo()).toBe(false);
  });

  it('stores a deep copy — mutating signals after push does not corrupt the snapshot', () => {
    state.signals = { a: { label: 'original', steps: [] } };
    pushUndo();

    // Mutate current state
    state.signals.a.label = 'mutated';

    // Undo should restore the original label
    undo();
    expect(state.signals.a.label).toBe('original');
  });
});

// ─── undo ────────────────────────────────────────────────────────────────────

describe('undo', () => {
  it('returns false when undo stack is empty', () => {
    expect(undo()).toBe(false);
  });

  it('returns true when undo is possible', () => {
    pushUndo();
    expect(undo()).toBe(true);
  });

  it('restores the previous signals snapshot', () => {
    state.signals = { a: { label: 'before', steps: [] } };
    pushUndo();
    state.signals = { b: { label: 'after', steps: [] } };

    undo();

    expect(state.signals).toHaveProperty('a');
    expect(state.signals.a.label).toBe('before');
    expect(state.signals).not.toHaveProperty('b');
  });

  it('makes canRedo() true after undoing', () => {
    pushUndo();
    undo();
    expect(canRedo()).toBe(true);
  });

  it('calls saveSignals (window.arduino.saveData) on each undo', () => {
    pushUndo();
    undo();
    expect(global.window.arduino.saveData).toHaveBeenCalled();
  });
});

// ─── redo ────────────────────────────────────────────────────────────────────

describe('redo', () => {
  it('returns false when redo stack is empty', () => {
    expect(redo()).toBe(false);
  });

  it('returns true when redo is possible', () => {
    pushUndo();
    undo();
    expect(redo()).toBe(true);
  });

  it('re-applies the undone change', () => {
    state.signals = { a: { label: 'v1', steps: [] } };
    pushUndo();
    state.signals = { b: { label: 'v2', steps: [] } };

    undo(); // back to v1
    redo(); // forward to v2

    expect(state.signals).toHaveProperty('b');
    expect(state.signals.b.label).toBe('v2');
  });

  it('calls saveSignals (window.arduino.saveData) on each redo', () => {
    pushUndo();
    undo();
    global.window.arduino.saveData.mockClear();
    redo();
    expect(global.window.arduino.saveData).toHaveBeenCalled();
  });
});

// ─── undo / redo interaction ─────────────────────────────────────────────────

describe('undo / redo interaction', () => {
  it('new pushUndo clears the redo stack', () => {
    pushUndo();
    undo();          // something is in redo
    expect(canRedo()).toBe(true);

    pushUndo();      // new action wipes redo
    expect(canRedo()).toBe(false);
  });

  it('supports multiple undo/redo cycles', () => {
    state.signals = { a: { label: 'v1', steps: [] } };
    pushUndo();
    state.signals = { a: { label: 'v2', steps: [] } };
    pushUndo();
    state.signals = { a: { label: 'v3', steps: [] } };

    undo(); // v2
    expect(state.signals.a.label).toBe('v2');
    undo(); // v1
    expect(state.signals.a.label).toBe('v1');
    redo(); // v2
    expect(state.signals.a.label).toBe('v2');
    redo(); // v3
    expect(state.signals.a.label).toBe('v3');
  });
});

// ─── MAX_UNDO stack cap ───────────────────────────────────────────────────────

describe('undo stack cap (MAX_UNDO = 30)', () => {
  it('drops the oldest snapshot once the stack exceeds 30 entries', () => {
    // Push snapshot #0 (oldest) with a unique label we can detect
    state.signals = { a: { label: 'oldest', steps: [] } };
    pushUndo();

    // Push 30 more snapshots to overflow the stack
    for (let i = 1; i <= 30; i++) {
      state.signals = { a: { label: `v${i}`, steps: [] } };
      pushUndo();
    }

    // Undo 30 times – should only restore back to v1, not 'oldest'
    for (let i = 0; i < 30; i++) {
      undo();
    }

    // Stack should now be empty; 'oldest' was dropped
    expect(canUndo()).toBe(false);
    expect(state.signals.a.label).not.toBe('oldest');
  });
});
