// Node/Bun/Cloudflare-Workers backend preset: base() + import-x (cycle/
// duplicate detection) + runtime globals + no-console tuned for a server
// that ships to a log stream rather than a browser console.

import globals from 'globals'
import tseslint from 'typescript-eslint'
import importX from 'eslint-plugin-import-x'
import { createTypeScriptImportResolver } from 'eslint-import-resolver-typescript'
import prettier from 'eslint-config-prettier'
import { base } from './base.js'

/**
 * @param {{
 *   tsconfigRootDir: string,
 *   files?: string[],
 *   runtime?: 'worker' | 'bun' | 'node',
 *   extraRules?: Record<string, unknown>,
 * }} options
 */
export function node({
  tsconfigRootDir,
  files = ['**/*.ts'],
  runtime = 'worker',
  extraRules = {},
}) {
  const globalsByRuntime = { worker: globals.worker, bun: globals.bunBuiltin, node: globals.node }
  return tseslint.config(
    ...base({ tsconfigRootDir, files }),
    {
      extends: [importX.flatConfigs.typescript],
      files,
      languageOptions: { globals: globalsByRuntime[runtime] },
      settings: {
        'import-x/resolver-next': [
          createTypeScriptImportResolver({ project: `${tsconfigRootDir}/tsconfig.json` }),
        ],
      },
      rules: {
        'import-x/no-cycle': 'error',
        'import-x/no-duplicates': 'error',
        // Server logs go to a log stream, not a browser console — allow
        // warn/error for real diagnostics, flag stray console.log left
        // over from debugging.
        'no-console': ['warn', { allow: ['warn', 'error'] }],
        ...extraRules,
      },
    },
    prettier,
  )
}
