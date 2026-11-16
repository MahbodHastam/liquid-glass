import antfu from '@antfu/eslint-config'

export default antfu({
  vue: true,
  typescript: true,
  ignores: [
    '**/dist',
    '**/.nuxt',
    '**/.output',
    'test-results',
    '.playwright-mcp',
    'docs/**/*.md',
  ],
}, {
  rules: {
    'no-console': [
      'error',
      {
        allow: ['warn', 'error'],
      },
    ],
  },
}, {
  files: [
    'scripts/**',
    'test/**',
    'e2e/**',
    'bench/**',
    '**/*.config.ts',
  ],
  rules: { 'no-console': 'off', 'node/prefer-global/process': 'off', 'ts/no-explicit-any': 'off' },
})
