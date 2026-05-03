jest.mock('../main-process/window', () => ({ getWindow: jest.fn(() => null) }));

const { getReconnectDelay } = require('../main-process/serial');

// The delays array defined in serial.js: [3000, 6000, 12000, 20000, 30000]
const EXPECTED_DELAYS = [3000, 6000, 12000, 20000, 30000];

describe('getReconnectDelay', () => {
  it('returns the first delay for attempt 0', () => {
    expect(getReconnectDelay(0)).toBe(3000);
  });

  it('returns the correct delay for each defined index', () => {
    EXPECTED_DELAYS.forEach((delay, idx) => {
      expect(getReconnectDelay(idx)).toBe(delay);
    });
  });

  it('clamps to the last delay when attempts exceed the array length', () => {
    expect(getReconnectDelay(5)).toBe(30000);
    expect(getReconnectDelay(9)).toBe(30000);
    expect(getReconnectDelay(100)).toBe(30000);
  });

  it('returns the last delay for attempts equal to array length', () => {
    expect(getReconnectDelay(EXPECTED_DELAYS.length)).toBe(30000);
  });

  it('delay increases monotonically across defined indices', () => {
    for (let i = 1; i < EXPECTED_DELAYS.length; i++) {
      expect(getReconnectDelay(i)).toBeGreaterThan(getReconnectDelay(i - 1));
    }
  });
});
