module.exports = {
  testEnvironment: 'node',
  testMatch: ['<rootDir>/test/**/[^._]*.test.js'],
  transform: {
    '^.+\\.js$': 'babel-jest',
  },
  transformIgnorePatterns: ['<rootDir>/node_modules/'],
  moduleNameMapper: {
    '^electron$': '<rootDir>/__mocks__/electron.js',
  },
  clearMocks: true,
};
