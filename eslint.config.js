import globals from 'globals';
import react from 'eslint-plugin-react';

// Minimal config: the one rule that matters for the module split is
// no-undef — it statically catches any symbol a file uses but no longer
// has in scope now that the app isn't one giant script.
export default [
  {
    files: ['src/**/*.{js,jsx}'],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      parserOptions: { ecmaFeatures: { jsx: true } },
      globals: {
        ...globals.browser,
        firebase: 'readonly',
        QRCode: 'readonly',
      },
    },
    plugins: { react },
    settings: { react: { version: 'detect' } },
    rules: {
      'no-undef': 'error',
      'no-import-assign': 'error',
      'no-unused-vars': 'off',
      // Core no-undef ignores JSX identifiers; this catches <UndefinedComponent />
      'react/jsx-no-undef': 'error',
    },
  },
];
