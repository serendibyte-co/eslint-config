// The `serendibyte` ESLint plugin — currently just the element-aware
// `import-boundaries` rule wired by `boundaryPathRules()` in base.js. Exported
// separately so a consuming config can register the plugin and drive the rule
// by hand if it needs options the preset does not surface.

import importBoundaries from './rules/import-boundaries.js'

const plugin = {
  meta: { name: 'serendibyte' },
  rules: { 'import-boundaries': importBoundaries },
}

export default plugin
