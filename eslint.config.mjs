import nx from '@nx/eslint-plugin';

export default [
  ...nx.configs['flat/base'],
  ...nx.configs['flat/typescript'],
  ...nx.configs['flat/javascript'],
  {
    // Build output and Nx-generated config files we do not hand-maintain.
    ignores: ['**/dist', '**/out-tsc', '**/jest.config.cts', '**/jest.preset.js'],
  },
  {
    files: ['**/*.ts', '**/*.tsx', '**/*.js', '**/*.jsx'],
    rules: {
      '@nx/enforce-module-boundaries': [
        'error',
        {
          enforceBuildableLibDependency: true,
          allow: ['^.*/eslint(\\.base)?\\.config\\.[cm]?[jt]s$'],
          depConstraints: [
            // --- scope isolation: api and console must never depend on each other ---
            { sourceTag: 'scope:api', onlyDependOnLibsWithTags: ['scope:api', 'scope:shared'] },
            { sourceTag: 'scope:console', onlyDependOnLibsWithTags: ['scope:console', 'scope:shared'] },
            { sourceTag: 'scope:shared', onlyDependOnLibsWithTags: ['scope:shared'] },

            // --- layer direction (approved Milestone 0 dependency graph) ---
            // domain -> nothing (framework-independent leaf)
            { sourceTag: 'type:domain', onlyDependOnLibsWithTags: [] },

            // data-access -> domain only
            { sourceTag: 'type:data-access', onlyDependOnLibsWithTags: ['type:domain'] },

            // feature -> domain + data-access + ui
            {
              sourceTag: 'type:feature',
              onlyDependOnLibsWithTags: ['type:domain', 'type:data-access', 'type:ui'],
            },

            // ui -> domain only
            { sourceTag: 'type:ui', onlyDependOnLibsWithTags: ['type:domain'] },

            // app -> may compose any layer within its own scope
            {
              sourceTag: 'type:app',
              onlyDependOnLibsWithTags: [
                'type:feature',
                'type:data-access',
                'type:ui',
                'type:domain',
              ],
            },
          ],
        },
      ],
    },
  },
  {
    files: [
      '**/*.ts',
      '**/*.tsx',
      '**/*.cts',
      '**/*.mts',
      '**/*.js',
      '**/*.jsx',
      '**/*.cjs',
      '**/*.mjs',
    ],
    // Override or add rules here
    rules: {},
  },
];
