// serendibyte/hooks-in-hook-files
//
// A custom React hook (`useX`) may only be *defined* in a hook module: a file
// inside a `hooks/` directory, or a file itself named `useX.ts(x)`. Defining
// one inline in a component file couples the logic to the JSX it lives next
// to and hides it from the per-hook file-length / test conventions.
// `react-hooks/rules-of-hooks` governs how hooks are *called*; this governs
// where they *live*.

import micromatch from 'micromatch'

const HOOK_NAME = /^use[A-Z]/

const messages = {
  moveToHookFile:
    "Custom hook '{{name}}' is defined in '{{file}}'. Move it to a module under a '{{dirs}}' directory or a file named '{{name}}.ts(x)'.",
}

const optionsSchema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    /** Directory names that hold hook modules. Any ancestor segment matches. */
    hooksDirs: { type: 'array', items: { type: 'string' }, minItems: 1 },
    /** Also allow a file whose basename is itself a hook name (`useFoo.ts`). */
    allowHookFilenames: { type: 'boolean' },
    /** Files skipped entirely (micromatch globs against the POSIX path). */
    ignore: { type: 'array', items: { type: 'string' } },
  },
}

const DEFAULTS = {
  hooksDirs: ['hooks'],
  allowHookFilenames: true,
  ignore: ['**/*.test.*', '**/*.spec.*', '**/__tests__/**'],
}

/** Name of a hook-shaped function node, or null. */
function hookName(node) {
  if (node.type === 'FunctionDeclaration') {
    return node.id && HOOK_NAME.test(node.id.name) ? node.id.name : null
  }
  // const useFoo = () => {} / function () {}
  if (node.type === 'VariableDeclarator') {
    const init = node.init
    const isFn =
      init && (init.type === 'ArrowFunctionExpression' || init.type === 'FunctionExpression')
    return isFn && node.id.type === 'Identifier' && HOOK_NAME.test(node.id.name)
      ? node.id.name
      : null
  }
  return null
}

/** @type {import('eslint').Rule.RuleModule} */
const rule = {
  meta: {
    type: 'suggestion',
    docs: {
      description:
        'Require custom React hooks to be defined in a hooks/ directory or a useX-named file, not inline in component files.',
      recommended: false,
    },
    schema: [optionsSchema],
    messages,
  },

  create(context) {
    const opts = { ...DEFAULTS, ...(context.options[0] ?? {}) }
    const filename = (context.filename ?? context.getFilename?.() ?? '').replace(/\\/g, '/')
    if (!filename || filename.startsWith('<')) return {}
    if (micromatch.isMatch(filename, opts.ignore)) return {}

    const segments = filename.split('/')
    const base = segments.pop()
    const stem = base.replace(/\.[^.]+$/, '')
    if (opts.allowHookFilenames && HOOK_NAME.test(stem)) return {}
    if (segments.some((s) => opts.hooksDirs.includes(s))) return {}

    const report = (node) => {
      const name = hookName(node)
      if (!name) return
      context.report({
        node: node.id,
        messageId: 'moveToHookFile',
        data: { name, file: base, dirs: opts.hooksDirs.join('/ or ') },
      })
    }

    return { FunctionDeclaration: report, VariableDeclarator: report }
  },
}

export default rule
