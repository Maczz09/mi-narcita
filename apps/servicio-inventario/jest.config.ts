module.exports = {
  displayName: 'servicio-inventario',
  preset: '../../jest.preset.js',
  testEnvironment: 'node',
  coverageDirectory: 'test-output/jest/coverage',
  moduleNameMapper: {
    '^uuid$': '<rootDir>/../../jest.uuid.mock.js',
  },
};
