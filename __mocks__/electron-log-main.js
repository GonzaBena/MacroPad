const log = {
  initialize: jest.fn(),
  info:    jest.fn(),
  warn:    jest.fn(),
  error:   jest.fn(),
  debug:   jest.fn(),
  verbose: jest.fn(),
  transports: {
    file:    { level: 'info', maxSize: 0, format: '' },
    console: { level: false },
  },
  errorHandler: { startCatching: jest.fn() },
};

module.exports = log;
