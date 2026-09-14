import { RuleTester } from '@typescript-eslint/rule-tester'
import { afterAll, describe, it } from 'bun:test'

import rule from '../rules/hooks-in-hook-files.js'

RuleTester.afterAll = afterAll
RuleTester.describe = describe
RuleTester.it = it

const decl = 'function useThing() { return 1 }'
const arrow = 'const useThing = () => 1'
const fnExpr = 'const useThing = function () { return 1 }'
const err = (name = 'useThing', file = 'Comp.tsx', dirs = 'hooks') => [
  { messageId: 'moveToHookFile', data: { name, file, dirs } },
]

new RuleTester().run('hooks-in-hook-files', rule, {
  valid: [
    // inside a hooks/ directory, at any depth
    { code: decl, filename: '/p/src/hooks/useThing.ts' },
    { code: arrow, filename: '/p/src/features/x/hooks/useThing.tsx' },
    { code: decl, filename: '/p/src/hooks/nested/misc.ts' },
    // file named after a hook, outside any hooks/ dir
    { code: decl, filename: '/p/src/features/x/useThing.ts' },
    { code: `export ${decl}`, filename: '/p/src/analytics/useAnalytics.ts' },
    // a component file that only *calls* hooks
    { code: 'function Comp() { const v = useThing(); return v }', filename: '/p/src/Comp.tsx' },
    // not hook-shaped: `use` alone, lowercase after `use`, non-function value
    { code: 'function use() {}', filename: '/p/src/Comp.tsx' },
    { code: 'function user() {}', filename: '/p/src/Comp.tsx' },
    { code: 'const useThing = 42', filename: '/p/src/Comp.tsx' },
    // test files are ignored by default
    { code: decl, filename: '/p/src/Comp.test.tsx' },
    { code: decl, filename: '/p/src/__tests__/Comp.tsx' },
    // custom hooksDirs
    { code: decl, filename: '/p/src/lib/hooks-lib/x.ts', options: [{ hooksDirs: ['hooks-lib'] }] },
    // custom ignore
    { code: decl, filename: '/p/src/legacy/Comp.tsx', options: [{ ignore: ['**/legacy/**'] }] },
  ],
  invalid: [
    { code: decl, filename: '/p/src/Comp.tsx', errors: err() },
    { code: arrow, filename: '/p/src/Comp.tsx', errors: err() },
    { code: fnExpr, filename: '/p/src/Comp.tsx', errors: err() },
    { code: `export ${decl}`, filename: '/p/src/Comp.tsx', errors: err() },
    // a .ts util file is not a hook module either
    { code: decl, filename: '/p/src/utils/thing.ts', errors: err('useThing', 'thing.ts') },
    // nested inside a component body
    {
      code: 'function Comp() { function useLocal() {} return null }',
      filename: '/p/src/Comp.tsx',
      errors: err('useLocal'),
    },
    // hook-named file is not enough when that allowance is off
    {
      code: decl,
      filename: '/p/src/features/x/useThing.ts',
      options: [{ allowHookFilenames: false }],
      errors: err('useThing', 'useThing.ts'),
    },
    // custom hooksDirs replaces the default
    {
      code: decl,
      filename: '/p/src/hooks/useThing.ts',
      options: [{ hooksDirs: ['hooks-lib'], allowHookFilenames: false }],
      errors: err('useThing', 'useThing.ts', 'hooks-lib'),
    },
    // Windows separators are normalised
    { code: decl, filename: 'C:\\p\\src\\Comp.tsx', errors: err() },
  ],
})
