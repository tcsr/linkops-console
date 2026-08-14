const { createCjsPreset } = require('jest-preset-angular/presets');

const preset = createCjsPreset({ tsconfig: '<rootDir>/tsconfig.spec.json' });

module.exports = {
  ...preset,
  displayName: '@linkops/console-ui',
  setupFilesAfterEnv: ['<rootDir>/src/test-setup.ts'],
  // Resolve `@linkops/*` via the `@org/source` export condition (see
  // tsconfig.base.json) so Jest uses each lib's `src/index.ts`, not its
  // gitignored `dist/` — clean checkouts need no prior build.
  testEnvironmentOptions: {
    ...preset.testEnvironmentOptions,
    customExportConditions: ['@org/source', 'browser', 'node', 'default'],
  },
  moduleNameMapper: {
    ...preset.moduleNameMapper,
    // Resolve nodenext `.js` specifiers in the shared source to their `.ts`.
    '^(\\.{1,2}/.*)\\.js$': '$1',
  },
  coverageDirectory: 'test-output/jest/coverage',
};
