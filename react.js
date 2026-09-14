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
import { base, boundaryPathRules, resolveBoundariesConfig } from './base.js'
import serendibytePlugin from './plugin.js'

/**
 * @param {{
 *   tsconfigRootDir: string,
 *   files?: string[],
 *   reactVersion?: string,
 *   boundaries?: Parameters<typeof resolveBoundariesConfig>[0],
 *   boundaryPaths?: boolean | Parameters<typeof boundaryPathRules>[0],
 *   hookFiles?: boolean | { hooksDirs?: string[], allowHookFilenames?: boolean, ignore?: string[] },
 *   extraRules?: Record<string, unknown>,
 * }} options
 */
export function react({
  tsconfigRootDir,
  files = ['**/*.{ts,tsx}'],
  reactVersion = '19',
  boundaries,
  boundaryPaths,
  hookFiles = true,
  extraRules = {},
}) {
  return tseslint.config(
    ...base({ tsconfigRootDir, files, boundaries }),
    ...(boundaryPaths
      ? boundaryPathRules({
          deriveAliases: boundaryPaths === true,
          tsconfigRootDir,
          elements: boundaries?.elements,
          files: boundaries?.files,
          ...(typeof boundaryPaths === 'object' ? boundaryPaths : {}),
        })
      : []),
    {
      extends: [importX.flatConfigs.typescript],
      files,
      languageOptions: { globals: globals.browser },
      plugins: {
        react: reactPlugin,
        'react-hooks': reactHooks,
        'react-refresh': reactRefresh,
        'jsx-a11y': jsxA11y,
        serendibyte: serendibytePlugin,
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
        // Hygiene rules eslint-plugin-react leaves out of `recommended` (it
        // ships them only in `all`, alongside formatting rules that fight
        // Prettier and several that crash on ESLint 10). Correctness or
        // cheap/autofixable only — no style dogma. `warn` per the severity
        // policy; promote per project via extraRules once clean.
        'react/jsx-no-leaked-render': 'warn', // `{count && <X/>}` renders `0`
        'react/button-has-type': 'warn', // a typeless <button> inside <form> submits
        'react/no-array-index-key': 'warn',
        'react/no-object-type-as-default-prop': 'warn', // `= {}` defaults defeat memo
        'react/jsx-boolean-value': 'warn',
        'react/self-closing-comp': 'warn',
        'react/jsx-no-useless-fragment': ['warn', { allowExpressions: true }],
        'react-refresh/only-export-components': ['warn', { allowConstantExport: true }],
        'import-x/no-cycle': 'error',
        'import-x/no-duplicates': 'error',
        'jsx-a11y/click-events-have-key-events': 'warn',
        'jsx-a11y/no-noninteractive-element-interactions': 'warn',
        'jsx-a11y/no-autofocus': 'warn',
        'jsx-a11y/label-has-associated-control': 'warn',
        // Custom hooks live in hooks/ (or a useX-named file), not inline in
        // component files. `warn` per the severity policy — the codebase this
        // was extracted from still had a straggler when the rule landed.
        ...(hookFiles
          ? {
              'serendibyte/hooks-in-hook-files': [
                'warn',
                ...(typeof hookFiles === 'object' ? [hookFiles] : []),
              ],
            }
          : {}),
        // Scoped to React/TSX specifically rather than repo-wide — still
        // worth carrying here since any React project can hit the same
        // patterns.
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
