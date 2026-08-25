// Generates a lint-staged config from a list of workspace directories,
// instead of every project hand-writing the same glob-to-eslint-fix mapping.
//
// Usage in a consuming project's package.json:
//
//   "lint-staged": "node_modules/@serendibyte-co/eslint-config/hooks/lint-staged.js"
//
// lint-staged accepts either a config object OR a function returning one, and
// resolves a string entry as a path to a module exporting either — so a
// project with non-default workspace names/extensions passes them via a
// small wrapper module instead:
//
//   // lint-staged.config.js
//   import { lintStagedConfig } from '@serendibyte-co/eslint-config/hooks/lint-staged.js'
//   export default lintStagedConfig({
//     workspaces: [
//       { dir: 'api', extensions: ['ts'] },
//       { dir: 'web', extensions: ['ts', 'tsx'] },
//     ],
//   })

/**
 * @param {{
 *   workspaces?: { dir: string, extensions?: string[] }[],
 *   rootFiles?: string[],
 * }} [options]
 */
export function lintStagedConfig({ workspaces = [], rootFiles = ['e2e/**/*.ts'] } = {}) {
  /** @type {Record<string, string[]>} */
  const config = {}

  for (const { dir, extensions = ['ts'] } of workspaces) {
    const pattern =
      extensions.length === 1
        ? `${dir}/**/*.${extensions[0]}`
        : `${dir}/**/*.{${extensions.join(',')}}`
    config[pattern] = [`bun --cwd ${dir} eslint --fix`]
  }

  if (rootFiles.length > 0) {
    config[`{${rootFiles.join(',')}}`] = ['eslint --fix']
  }

  config['*.{ts,tsx,js,jsx,json,md,css}'] = ['prettier --write']

  return config
}

// Default export: no workspaces configured (root-only projects, or projects
// that want to pass their own options via the named export above).
export default lintStagedConfig()
