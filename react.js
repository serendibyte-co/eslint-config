// React/Vite frontend preset: base() + react, jsx-a11y, react-hooks,
// react-refresh, import-x, and a browser global set.

import globals from 'globals'
import tseslint from 'typescript-eslint'
import reactPlugin from 'eslint-plugin-react'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import jsxA11y from 'eslint-plugin-jsx-a11y'
import importX from 'eslint-plugin-import-x'
import { createTypeScriptImportResolver } from 'eslint-import-resolver-typescript'
import prettier from 'eslint-config-prettier'
import { base, resolveBoundariesConfig } from './base.js'

/**
 * @param {{
 *   tsconfigRootDir: string,
 *   files?: string[],
 *   reactVersion?: string,
 *   boundaries?: Parameters<typeof resolveBoundariesConfig>[0],
 *   extraRules?: Record<string, unknown>,
 * }} options
 */
export function react({
  tsconfigRootDir,
  files = ['**/*.{ts,tsx}'],
  reactVersion = '19',
  boundaries,
  extraRules = {},
}) {
  return tseslint.config(
    ...base({ tsconfigRootDir, files, boundaries }),
    {
      extends: [importX.flatConfigs.typescript],
      files,
      languageOptions: { globals: globals.browser },
      plugins: {
        react: reactPlugin,
        'react-hooks': reactHooks,
        'react-refresh': reactRefresh,
        'jsx-a11y': jsxA11y,
      },
      settings: {
        // 'detect' calls into eslint-plugin-react's context.getFilename()
        // version probe, which ESLint 10's flat-config context no longer
        // exposes — pin explicitly instead. Bump this when React's major
        // version changes.
        react: { version: reactVersion },
        'import-x/resolver-next': [
          createTypeScriptImportResolver({ project: `${tsconfigRootDir}/tsconfig.json` }),
        ],
      },
      rules: {
        ...reactPlugin.configs.flat.recommended.rules,
        ...reactPlugin.configs.flat['jsx-runtime'].rules,
        ...reactHooks.configs.recommended.rules,
        ...jsxA11y.flatConfigs.recommended.rules,
        'react/prop-types': 'off',
        'react-refresh/only-export-components': ['warn', { allowConstantExport: true }],
        'import-x/no-cycle': 'error',
        'import-x/no-duplicates': 'error',
        'jsx-a11y/click-events-have-key-events': 'warn',
        'jsx-a11y/no-noninteractive-element-interactions': 'warn',
        'jsx-a11y/no-autofocus': 'warn',
        'jsx-a11y/label-has-associated-control': 'warn',
        // Fires on React/TSX specifically, not repo-wide, per matchbox21's
        // rollout — still worth carrying here since any React project can
        // hit the same patterns.
        'sonarjs/deprecation': 'warn',
        'sonarjs/no-nested-conditional': 'warn',
        'sonarjs/no-nested-template-literals': 'warn',
        'sonarjs/prefer-read-only-props': 'warn',
        'unicorn/no-array-callback-reference': 'warn',
        'unicorn/no-global-object-property-assignment': 'warn',
        'unicorn/no-top-level-assignment-in-function': 'warn',
        'unicorn/no-unnecessary-global-this': 'warn',
        ...extraRules,
      },
    },
    prettier,
  )
}
