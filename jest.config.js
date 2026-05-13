module.exports = {
  testEnvironment: 'node',
  testMatch: ['<rootDir>/test/**/[^._]*.test.{js,ts}'],
  transform: {
    '^.+\\.[jt]s$': 'babel-jest',
  },
  transformIgnorePatterns: ['<rootDir>/node_modules/'],
  testPathIgnorePatterns: ['/node_modules/', '/dist-ts/', '/renderer/js/temp_build/'],
  modulePathIgnorePatterns: ['<rootDir>/dist-ts/', '<rootDir>/renderer/js/temp_build/'],
  moduleNameMapper: {
    '^electron$': '<rootDir>/__mocks__/electron.js',
    '^electron-log/main$': '<rootDir>/__mocks__/electron-log-main.js',
    // Allow tests to import .js paths and resolve to .ts sources
    '^(\\.\\.?/.*)\\.js$': '$1',
  },
  clearMocks: true,
  restoreMocks: true,
};
