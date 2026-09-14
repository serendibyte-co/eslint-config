// The `serendibyte` ESLint plugin — the element-aware `import-boundaries` rule
// wired by `boundaryPathRules()` in base.js, and `hooks-in-hook-files` wired by
// the react preset. Exported separately so a consuming config can register the
// plugin and drive a rule by hand if it needs options the preset does not
// surface.

import hooksInHookFiles from './rules/hooks-in-hook-files.js'
import importBoundaries from './rules/import-boundaries.js'

const plugin = {
  meta: { name: 'serendibyte' },
  rules: {
    'import-boundaries': importBoundaries,
    'hooks-in-hook-files': hooksInHookFiles,
  },
}

export default plugin
