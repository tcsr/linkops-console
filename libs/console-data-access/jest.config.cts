const { createCjsPreset } = require('jest-preset-angular/presets');

const preset = createCjsPreset({ tsconfig: '<rootDir>/tsconfig.spec.json' });

module.exports = {
  ...preset,
  displayName: '@linkops/console-data-access',
  setupFilesAfterEnv: ['<rootDir>/src/test-setup.ts'],
  // Resolve `@linkops/*` via the `@org/source` export condition (see
  // tsconfig.base.json) so Jest uses each lib's `src/index.ts`, not its
  // gitignored `dist/` — clean checkouts need no prior build. `browser`/`node`/
  // `default` keep normal resolution for Angular/rxjs and everything else.
  testEnvironmentOptions: {
    ...preset.testEnvironmentOptions,
    customExportConditions: ['@org/source', 'browser', 'node', 'default'],
  },
  moduleNameMapper: {
    ...preset.moduleNameMapper,
    // The shared libraries (domain) use nodenext `.js` specifiers in their TS
    // source; when Jest reads that source it must resolve `./x.js` → `./x.ts`.
    '^(\\.{1,2}/.*)\\.js$': '$1',
  },
  coverageDirectory: 'test-output/jest/coverage',
};
