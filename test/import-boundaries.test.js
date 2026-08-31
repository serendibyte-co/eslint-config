import path from 'node:path'

import { RuleTester } from '@typescript-eslint/rule-tester'
import { afterAll, describe, it } from 'bun:test'

import { boundaryPathRules, folderElements, resolveBoundariesConfig } from '../base.js'
import rule from '../rules/import-boundaries.js'

RuleTester.afterAll = afterAll
RuleTester.describe = describe
RuleTester.it = it

// A throwaway fixture monorepo — abstract placeholder names on purpose. The
// rule cares about shape (a module folder, a nested module folder, a sibling
// module, a second package), never about what anything is called.
//
//   packages/app     — mod-a, mod-a/inner (nested), mod-b ; @/* -> ./src/*
//   packages/pkg-a   — the importer in the cross-package cases
//   packages/pkg-b   — the cross-package target
//   packages/no-src  — a package whose root IS the package ; @/* -> ./*
const FIX = path.resolve(import.meta.dir, 'fixtures/import-boundaries')
const app = (rel) => path.join(FIX, 'packages/app', rel)

const APP_ELEMENTS = [
  { type: 'modA', pattern: 'src/mod-a' },
  { type: 'modAInner', pattern: 'src/mod-a/inner' },
  { type: 'modB', pattern: 'src/mod-b' },
]
const appOpts = (extra = {}) => ({
  aliases: { '@/': 'src' },
  packageAliases: { '@pkg-b/': 'packages/pkg-b/src' },
  elements: APP_ELEMENTS,
  ...extra,
})

new RuleTester().run('import-boundaries', rule, {
  valid: [
    // relative sibling that stays inside the module
    { code: "import { c } from '../c'", filename: app('src/mod-a/a/b.ts'), options: [appOpts()] },
    // bare specifier
    { code: "import 'node:fs'", filename: app('src/mod-b/y.ts'), options: [appOpts()] },
    // cross-module import already using the alias
    {
      code: "import { x } from '@/mod-b/x'",
      filename: app('src/mod-a/y.ts'),
      options: [appOpts()],
    },
    // cross-package import already using the package alias
    {
      code: "import { p } from '@pkg-b/util/parse'",
      filename: app('src/mod-b/y.ts'),
      options: [appOpts()],
    },
    // file outside the root tree is ignored
    {
      code: "import { x } from '@/mod-b/x'",
      filename: app('scripts/foo.ts'),
      options: [appOpts()],
    },
    // two loose root-tree files importing each other relatively
    {
      code: "import './styles.css'\nimport { x } from './boot'",
      filename: app('src/main.ts'),
      options: [appOpts()],
    },
    // non-code import (stylesheet) never participates in the module graph
    {
      code: "import '@/mod-b/theme.css'",
      filename: app('src/mod-a/y.ts'),
      options: [appOpts()],
    },
    // type import honoured off
    {
      code: "import type { T } from '@/mod-b/x'",
      filename: app('src/mod-b/y.ts'),
      options: [appOpts({ checkTypeImports: false })],
    },
    // escape hatch
    {
      code: "import { x } from '@/mod-b/x'",
      filename: app('src/mod-b/y.ts'),
      options: [appOpts({ allowSameModuleAlias: true })],
    },
  ],

  invalid: [
    // alias for a same-module sibling
    {
      code: "import { x } from '@/mod-a/x'",
      filename: app('src/mod-a/y.ts'),
      options: [appOpts()],
      errors: [{ messageId: 'sameModuleNeedsRelative' }],
      output: "import { x } from './x'",
    },
    // relative path climbing out of the module
    {
      code: "import { x } from '../../mod-b/x'",
      filename: app('src/mod-a/inner/y.ts'),
      options: [appOpts()],
      errors: [{ messageId: 'relativeEscapesModule' }],
      output: "import { x } from '@/mod-b/x'",
    },
    // cross-package relative path → suggestion only
    {
      code: "import { p } from '../../../pkg-b/src/util/parse'",
      filename: path.join(FIX, 'packages/pkg-a/src/mod-b/x.ts'),
      options: [appOpts()],
      errors: [
        {
          messageId: 'crossPackageNeedsAlias',
          suggestions: [
            { messageId: 'replaceWithAlias', output: "import { p } from '@pkg-b/util/parse'" },
          ],
        },
      ],
    },
    // barrel import of the own module
    {
      code: "import mod from '@/mod-a'",
      filename: app('src/mod-a/y.ts'),
      options: [appOpts()],
      errors: [{ messageId: 'sameModuleNeedsRelative' }],
      output: "import mod from './'",
    },
    // nested modules: longest match wins — same nested module, alias → relative
    {
      code: "import { z } from '@/mod-a/inner/z'",
      filename: app('src/mod-a/inner/y.ts'),
      options: [appOpts()],
      errors: [{ messageId: 'sameModuleNeedsRelative' }],
      output: "import { z } from './z'",
    },
    // nested modules: parent → child is a module crossing (relative, no `..`)
    {
      code: "import { t } from './inner/thing'",
      filename: app('src/mod-a/y.ts'),
      options: [appOpts()],
      errors: [{ messageId: 'crossModuleNeedsAlias' }],
      output: "import { t } from '@/mod-a/inner/thing'",
    },
    // type import checked by default
    {
      code: "import type { T } from '@/mod-b/x'",
      filename: app('src/mod-b/y.ts'),
      options: [appOpts()],
      errors: [{ messageId: 'sameModuleNeedsRelative' }],
      output: "import type { T } from './x'",
    },
    // re-export
    {
      code: "export * from '@/mod-b/x'",
      filename: app('src/mod-b/index.ts'),
      options: [appOpts()],
      errors: [{ messageId: 'sameModuleNeedsRelative' }],
      output: "export * from './x'",
    },
    // dynamic import
    {
      code: "const m = import('@/mod-b/x')",
      filename: app('src/mod-b/y.ts'),
      options: [appOpts()],
      errors: [{ messageId: 'sameModuleNeedsRelative' }],
      output: "const m = import('./x')",
    },
    // .js specifier keeps its extension
    {
      code: "import { h } from '@/mod-b/helper.js'",
      filename: app('src/mod-b/other.ts'),
      options: [appOpts()],
      errors: [{ messageId: 'sameModuleNeedsRelative' }],
      output: "import { h } from './helper.js'",
    },
    // case-only difference: report, never autofix
    {
      code: "import { t } from '@/mod-b/Thing'",
      filename: app('src/mod-b/y.ts'),
      options: [appOpts()],
      errors: [{ messageId: 'sameModuleNeedsRelative' }],
      output: null,
    },
    // cross-package with no packageAliases entry configured
    {
      code: "import { p } from '../../../pkg-b/src/util/parse'",
      filename: path.join(FIX, 'packages/pkg-a/src/mod-b/x.ts'),
      options: [appOpts({ packageAliases: {} })],
      errors: [{ messageId: 'crossPackageNoAlias' }],
      output: null,
    },
  ],
})

// a package whose root IS the package: `aliases: { '@/': '.' }`, `root: '.'`
const noSrc = (rel) => path.join(FIX, 'packages/no-src', rel)
const NO_SRC_OPTS = {
  aliases: { '@/': '.' },
  root: '.',
  elements: [{ type: 'area', pattern: 'area' }],
}
new RuleTester().run('import-boundaries (root alias = .)', rule, {
  valid: [
    {
      code: "import { c } from './client'",
      filename: noSrc('area/other.ts'),
      options: [NO_SRC_OPTS],
    },
  ],
  invalid: [
    {
      code: "import { c } from '@/area/client'",
      filename: noSrc('area/inner/x.ts'),
      options: [NO_SRC_OPTS],
      errors: [{ messageId: 'sameModuleNeedsRelative' }],
      output: "import { c } from '../client'",
    },
  ],
})

describe('base.js helpers', () => {
  it('deriveAliasesFromTsconfig via boundaryPaths: true', () => {
    const cfg = boundaryPathRules({ deriveAliases: true, tsconfigRootDir: app('.') })
    const opts = cfg[0].rules['serendibyte/import-boundaries'][1]
    if (JSON.stringify(opts.aliases) !== JSON.stringify({ '@/': 'src' })) {
      throw new Error(`derived ${JSON.stringify(opts.aliases)}`)
    }
  })

  it('folderElements expands bare folders', () => {
    const els = folderElements('src', ['one', 'two'])
    const expected = [
      { type: 'one', pattern: 'src/one', partialMatch: false },
      { type: 'two', pattern: 'src/two', partialMatch: false },
    ]
    if (JSON.stringify(els) !== JSON.stringify(expected)) throw new Error(JSON.stringify(els))
  })

  it('guardrail throws on a glob pattern when noUnknownFiles is set', () => {
    let threw = false
    try {
      resolveBoundariesConfig({
        noUnknownFiles: 'error',
        elements: [{ type: 'x', pattern: 'src/x/*' }],
      })
    } catch {
      threw = true
    }
    if (!threw) throw new Error('expected resolveBoundariesConfig to throw')
  })

  it('guardrail throws on a mode key when noUnknownFiles is set', () => {
    let threw = false
    try {
      resolveBoundariesConfig({
        noUnknownFiles: 'error',
        elements: [{ type: 'x', pattern: 'src/x', mode: 'folder' }],
      })
    } catch {
      threw = true
    }
    if (!threw) throw new Error('expected resolveBoundariesConfig to throw')
  })
})
