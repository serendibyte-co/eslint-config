// serendibyte/import-boundaries
//
// Element-aware replacement for the old `boundaryPathRules` directory-depth
// heuristic. Resolves both the importing file and the import target, classifies
// each into a module (from `boundaries/elements`), and enforces:
//
//   same module       → relative (`./`, `../` that stays inside the module)
//   different module   → the in-package alias (`@/…`)
//   package root       → the in-package alias (`@/…`)
//   different package  → a configured package alias, never `../../<pkg>`
//
// Autofix rewrites in-package both directions; cross-package is suggestion-only.

import path from 'node:path'

import {
  aliasCovers,
  classifyLocation,
  classifySpecifier,
  findPackageDir,
  findWorkspaceRoot,
  isCaseOnlyMatch,
  resolveOnDisk,
  resolveSpecifier,
  toAliasSpecifier,
  toPackageAliasSpecifier,
  toPosix,
  toRelativeSpecifier,
} from './lib.js'

const CODE_EXT = new Set(['.js', '.jsx', '.mjs', '.cjs', '.ts', '.tsx', '.mts', '.cts'])

const messages = {
  sameModuleNeedsRelative:
    "Import within module '{{module}}' must be relative. Use '{{suggested}}' instead of '{{actual}}'.",
  crossModuleNeedsAlias:
    "Import from module '{{fromModule}}' into '{{toModule}}' must use the '{{aliasPrefix}}' alias. Use '{{suggested}}' instead of '{{actual}}'.",
  rootNeedsAlias:
    "Import into the package root must use the '{{aliasPrefix}}' alias. Use '{{suggested}}' instead of '{{actual}}'.",
  relativeEscapesModule:
    "Relative import '{{actual}}' climbs out of module '{{module}}'. Use the '{{aliasPrefix}}' alias: '{{suggested}}'.",
  crossPackageNeedsAlias:
    "Import from package '{{fromPkg}}' into '{{toPkg}}' must use a package alias, not a relative path. Use '{{suggested}}' instead of '{{actual}}'.",
  crossPackageNoAlias:
    "Import '{{actual}}' crosses into package '{{toPkg}}'; configure a `packageAliases` entry for it.",
  replaceWithAlias: "Replace with '{{suggested}}'.",
}

/** `{ '@/*': './src/*' }` / `{ '@': 'src' }` → `{ '@/': 'src' }`. */
function normalizeAliasMap(map) {
  const out = {}
  for (const [k, v] of Object.entries(map ?? {})) {
    const key = k.replace(/\/?\*?$/, '').replace(/\/?$/, '/')
    const val = String(v).replace(/^\.\//, '').replace(/\/\*$/, '').replace(/\/$/, '')
    out[key] = val === '' ? '.' : val
  }
  return out
}

const optionsSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['aliases'],
  properties: {
    aliases: {
      oneOf: [
        { type: 'object', additionalProperties: { type: 'string' } },
        { type: 'array', items: { type: 'string' } },
      ],
    },
    packageAliases: { type: 'object', additionalProperties: { type: 'string' } },
    elements: { type: 'array' },
    files: { type: 'array' },
    root: { type: 'string' },
    severity: { enum: ['off', 'warn', 'error'] },
    checkTypeImports: { type: 'boolean' },
    ignore: { type: 'array', items: { type: 'string' } },
    allowSameModuleAlias: { type: 'boolean' },
    workspaceRoot: { type: 'string' },
  },
}

/** @type {import('eslint').Rule.RuleModule} */
const rule = {
  meta: {
    type: 'problem',
    docs: {
      description:
        'Enforce relative imports within a module, an alias across modules, and a package alias across packages.',
      recommended: false,
    },
    fixable: 'code',
    hasSuggestions: true,
    schema: [optionsSchema],
    messages,
  },

  create(context) {
    const options = context.options[0] ?? {}
    if (!options.aliases || (Array.isArray(options.aliases) && options.aliases.length === 0)) {
      return {}
    }

    const filename = toPosix(context.filename ?? context.getFilename?.() ?? '')
    if (!filename || filename.startsWith('<')) return {}

    const packageDir = toPosix(findPackageDir(path.dirname(filename)))
    const workspaceRoot = findWorkspaceRoot(packageDir, options.workspaceRoot)
    const aliases = normalizeAliasMap(options.aliases)
    const packageAliases = normalizeAliasMap(options.packageAliases ?? {})
    const root = options.root ?? 'src'
    const checkTypeImports = options.checkTypeImports !== false
    const elements = options.elements ?? context.settings?.['boundaries/elements'] ?? []

    const fromLoc = classifyLocation(filename, { packageDir, root, elements })
    if (fromLoc.module === null) return {} // config/build file, or outside the root tree

    const ctx = { aliases, packageAliases, packageDir, workspaceRoot }

    /** Build a fixer that only applies when the rewrite resolves to a real file. */
    function safeFix(sourceNode, newSpec, toAbs, origExt) {
      const resolved = resolveOnDisk(toAbs, origExt)
      if (!resolved || isCaseOnlyMatch(resolved)) return null
      const q = sourceNode.raw?.[0] === "'" ? "'" : '"'
      return (fixer) => fixer.replaceText(sourceNode, q + newSpec + q)
    }

    function check(node, sourceNode, isType) {
      if (isType && !checkTypeImports) return
      const spec = sourceNode.value
      if (typeof spec !== 'string' || spec === '') return

      const kindInfo = classifySpecifier(spec, aliases, packageAliases)
      if (kindInfo.kind === 'bare') return

      // Non-code imports (stylesheets, JSON, assets) don't participate in the
      // module graph — a `.css` next to a component is not a boundary crossing.
      const specExt = path.extname(spec)
      if (specExt && !CODE_EXT.has(specExt)) return

      const resolved = resolveSpecifier(spec, filename, kindInfo, ctx)
      if (!resolved) return
      const { abs: toAbs, origExt } = resolved

      const toPackageDir = toPosix(findPackageDir(path.dirname(toAbs)))
      const toLoc = classifyLocation(toAbs, { packageDir: toPackageDir, root, elements })

      // --- cross-package -----------------------------------------------------
      if (toLoc.package !== fromLoc.package) {
        const pa = toPackageAliasSpecifier(toAbs, origExt, ctx)
        if (kindInfo.kind === 'packageAlias' && pa && kindInfo.prefix === pa.prefix) return
        if (!pa) {
          context.report({
            node,
            messageId: 'crossPackageNoAlias',
            data: { actual: spec, toPkg: path.basename(toLoc.package) },
          })
          return
        }
        context.report({
          node,
          messageId: 'crossPackageNeedsAlias',
          data: {
            actual: spec,
            suggested: pa.spec,
            fromPkg: path.basename(fromLoc.package),
            toPkg: path.basename(toLoc.package),
          },
          suggest: [
            {
              messageId: 'replaceWithAlias',
              data: { suggested: pa.spec },
              fix: (fixer) => {
                const q = sourceNode.raw?.[0] === "'" ? "'" : '"'
                return fixer.replaceText(sourceNode, q + pa.spec + q)
              },
            },
          ],
        })
        return
      }

      // --- same package ----------------------------------------------------
      if (toLoc.module === null) return // importing an unclassified non-root file

      // `<root>`→`<root>` counts as same-module: two loose root-tree files
      // importing each other relatively is fine; only crossing into/out of a
      // named module needs the alias.
      const sameModule = fromLoc.module === toLoc.module && fromLoc.moduleDir === toLoc.moduleDir

      if (sameModule) {
        if (kindInfo.kind === 'relative') return // already correct
        if (options.allowSameModuleAlias) return
        const suggested = toRelativeSpecifier(filename, toAbs, origExt)
        context.report({
          node,
          messageId: 'sameModuleNeedsRelative',
          data: { module: fromLoc.module, actual: spec, suggested },
          fix: safeFix(sourceNode, suggested, toAbs, origExt),
        })
        return
      }

      // --- different module / package root → in-package alias -------------
      if (kindInfo.kind === 'alias' && aliasCovers(kindInfo.prefix, toAbs, ctx)) return

      const suggested = toAliasSpecifier(toAbs, origExt, ctx)
      if (!suggested) return // no alias can express this target — nothing to suggest

      const aliasPrefix = suggested.match(/^[^/]*\//)?.[0] ?? Object.keys(aliases)[0]
      const messageId =
        toLoc.module === '<root>'
          ? 'rootNeedsAlias'
          : kindInfo.kind === 'relative' && spec.includes('..')
            ? 'relativeEscapesModule'
            : 'crossModuleNeedsAlias'

      context.report({
        node,
        messageId,
        data: {
          module: fromLoc.module,
          fromModule: fromLoc.module,
          toModule: toLoc.module,
          aliasPrefix,
          actual: spec,
          suggested,
        },
        fix: safeFix(sourceNode, suggested, toAbs, origExt),
      })
    }

    return {
      ImportDeclaration(node) {
        check(node, node.source, node.importKind === 'type')
      },
      ExportNamedDeclaration(node) {
        if (node.source) check(node, node.source, node.exportKind === 'type')
      },
      ExportAllDeclaration(node) {
        if (node.source) check(node, node.source, node.exportKind === 'type')
      },
      ImportExpression(node) {
        if (node.source?.type === 'Literal' && typeof node.source.value === 'string') {
          check(node, node.source, false)
        }
      },
    }
  },
}

export default rule
