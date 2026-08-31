// Helpers for the `serendibyte/import-boundaries` rule: package detection,
// specifier classification, file→module classification, and fix construction.
// Kept dependency-light — only `micromatch` (already a runtime dep) and node
// builtins. No ESLint API in here; the rule wires these together.

import fs from 'node:fs'
import path from 'node:path'

import micromatch from 'micromatch'

const JS_EXT = new Set(['.js', '.jsx', '.mjs', '.cjs'])
const TRY_EXT = ['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs', '.d.ts']
const GLOB_CHARS = /[*?[\](){}!+@]/

/** Normalise to POSIX separators — every comparison in this file is POSIX. */
export function toPosix(p) {
  return p.split(path.sep).join('/')
}

// --- package / workspace detection -----------------------------------------

const pkgDirCache = new Map()

/**
 * Nearest ancestor directory (inclusive) containing a package.json.
 * Resolves symlinks first (pnpm/bun stores). Returns `startDir` if none found.
 */
export function findPackageDir(startDir) {
  let dir
  try {
    dir = fs.realpathSync(startDir)
  } catch {
    dir = startDir
  }
  if (pkgDirCache.has(dir)) return pkgDirCache.get(dir)

  const chain = []
  let cur = dir
  while (true) {
    chain.push(cur)
    if (pkgDirCache.has(cur)) {
      const hit = pkgDirCache.get(cur)
      for (const d of chain) pkgDirCache.set(d, hit)
      return hit
    }
    if (fs.existsSync(path.join(cur, 'package.json'))) {
      for (const d of chain) pkgDirCache.set(d, cur)
      return cur
    }
    const parent = path.dirname(cur)
    if (parent === cur) break
    cur = parent
  }
  for (const d of chain) pkgDirCache.set(d, startDir)
  return startDir
}

/**
 * Nearest ancestor package.json that declares `workspaces` (npm/yarn/bun) or a
 * pnpm-workspace.yaml sibling. Falls back to the outermost package.json seen.
 */
export function findWorkspaceRoot(startDir, explicit) {
  if (explicit) return toPosix(path.resolve(explicit))
  let cur = findPackageDir(startDir)
  let fallback = cur
  while (true) {
    try {
      const pkg = JSON.parse(fs.readFileSync(path.join(cur, 'package.json'), 'utf8'))
      if (pkg.workspaces) return toPosix(cur)
    } catch {
      /* not a package dir */
    }
    if (fs.existsSync(path.join(cur, 'pnpm-workspace.yaml'))) return toPosix(cur)
    fallback = cur
    const parent = path.dirname(cur)
    if (parent === cur) break
    const next = findPackageDir(parent)
    if (next === cur) break
    cur = next
  }
  return toPosix(fallback)
}

// --- specifier classification --------------------------------------------------

/**
 * @param {string} spec raw import specifier
 * @param {Record<string,string>} aliases in-package alias map, prefix → target dir
 * @param {Record<string,string>} packageAliases cross-package alias map
 * @returns {{kind:'bare'|'relative'|'alias'|'packageAlias', prefix?:string, rest?:string}}
 */
export function classifySpecifier(spec, aliases, packageAliases) {
  if (spec === '.' || spec === '..' || spec.startsWith('./') || spec.startsWith('../')) {
    return { kind: 'relative' }
  }
  for (const prefix of Object.keys(packageAliases)) {
    if (spec === prefix.replace(/\/$/, '') || spec.startsWith(prefix)) {
      return { kind: 'packageAlias', prefix, rest: spec.slice(prefix.length) }
    }
  }
  for (const prefix of Object.keys(aliases)) {
    if (spec === prefix.replace(/\/$/, '') || spec.startsWith(prefix)) {
      return { kind: 'alias', prefix, rest: spec.slice(prefix.length) }
    }
  }
  return { kind: 'bare' }
}

/** Trailing `.js`→ ''(for classification). Returns { base, ext } where ext is '' or the original JS ext. */
export function splitJsExt(p) {
  const ext = path.extname(p)
  if (JS_EXT.has(ext)) return { base: p.slice(0, -ext.length), ext }
  return { base: p, ext: '' }
}

/**
 * Resolve a specifier to an absolute path (no extension resolution — classification only).
 * @returns {{ abs:string, origExt:string } | null}
 */
export function resolveSpecifier(spec, fromFile, kindInfo, ctx) {
  const { aliases, packageAliases, packageDir, workspaceRoot } = ctx
  let abs
  if (kindInfo.kind === 'relative') {
    abs = path.resolve(path.dirname(fromFile), spec)
  } else if (kindInfo.kind === 'alias') {
    const target = aliases[kindInfo.prefix]
    const targetDir = target === '.' || target === '' ? packageDir : path.join(packageDir, target)
    abs = kindInfo.rest ? path.join(targetDir, kindInfo.rest) : targetDir
  } else if (kindInfo.kind === 'packageAlias') {
    const target = packageAliases[kindInfo.prefix]
    const targetDir = path.join(workspaceRoot, target)
    abs = kindInfo.rest ? path.join(targetDir, kindInfo.rest) : targetDir
  } else {
    return null
  }
  const { base, ext } = splitJsExt(toPosix(abs))
  return { abs: base, origExt: ext }
}

// --- element / file classification ------------------------------------------

/** Expand a bare folder pattern (`src/mod`) to `src/mod/**`; keep glob patterns as-is. */
function normalizeElementPattern(pattern) {
  if (GLOB_CHARS.test(pattern)) {
    // fixed leading segment = everything up to the first glob segment
    const segs = pattern.split('/')
    const fixed = []
    for (const s of segs) {
      if (GLOB_CHARS.test(s)) break
      fixed.push(s)
    }
    return { match: [pattern], fixedPrefix: fixed.join('/') }
  }
  return { match: [pattern, `${pattern}/**`], fixedPrefix: pattern }
}

/**
 * @param {string} absFile
 * @param {{
 *   packageDir:string, root:string,
 *   elements:Array<{type:string,pattern:string|string[]}>,
 * }} ctx
 * @returns {{
 *   package:string, inRoot:boolean,
 *   module:string|null, moduleDir:string|null, singleFile:boolean,
 * }}
 */
export function classifyLocation(absFile, ctx) {
  const { packageDir, root, elements } = ctx
  const rel = toPosix(path.relative(packageDir, absFile))
  const rootIsPackage = root === '.' || root === ''
  const inRoot = rootIsPackage || rel === root || rel.startsWith(`${root}/`)

  // 1. longest-fixed-prefix element match wins (nested modules)
  let best = null
  for (const el of elements ?? []) {
    const patterns = Array.isArray(el.pattern) ? el.pattern : [el.pattern]
    for (const raw of patterns) {
      const { match, fixedPrefix } = normalizeElementPattern(raw)
      if (micromatch.isMatch(rel, match)) {
        if (!best || fixedPrefix.length > best.fixedPrefix.length) {
          best = { type: el.type, fixedPrefix }
        }
      }
    }
  }
  if (best) {
    return {
      package: packageDir,
      inRoot: true,
      module: best.type,
      moduleDir: toPosix(path.join(packageDir, best.fixedPrefix)),
      singleFile: false,
    }
  }

  // 2. the `<root>` pseudo-module — every root-tree file the elements list
  //    doesn't place lands here (incl. entrypoints / app-root / co-located
  //    `files` categories). `<root>`→`<root>` is a same-module relative import;
  //    `<root>`→a module (or the reverse) crosses a boundary → alias.
  if (inRoot) {
    return {
      package: packageDir,
      inRoot: true,
      module: `<root>`,
      moduleDir: toPosix(rootIsPackage ? packageDir : path.join(packageDir, root)),
      singleFile: false,
    }
  }

  // 3. outside the root tree, unclassified (config/build files) — imports ignored
  return { package: packageDir, inRoot: false, module: null, moduleDir: null, singleFile: false }
}

// --- fix construction --------------------------------------------------------

/** `path.relative` with a guaranteed leading `./`, POSIX, ext re-attached. */
export function toRelativeSpecifier(fromFile, toAbs, origExt) {
  let rel = toPosix(path.relative(path.dirname(fromFile), toAbs))
  if (rel === '') return `./${origExt}` // barrel import of the file's own module dir
  if (!rel.startsWith('.')) rel = `./${rel}`
  return rel + origExt
}

/**
 * Pick the in-package alias whose target dir is an ancestor of `toAbs`
 * (declaration order breaks ties), return `prefix + relative + ext`.
 * @returns {string|null}
 */
export function toAliasSpecifier(toAbs, origExt, ctx) {
  const { aliases, packageDir } = ctx
  for (const [prefix, target] of Object.entries(aliases)) {
    const targetDir =
      target === '.' || target === '' ? packageDir : toPosix(path.join(packageDir, target))
    if (toAbs === targetDir) return prefix.replace(/\/$/, '') + origExt
    if (toAbs.startsWith(`${targetDir}/`)) {
      return prefix + toAbs.slice(targetDir.length + 1) + origExt
    }
  }
  return null
}

/**
 * Pick the package alias covering `toAbs` (longest target dir wins).
 * @returns {{ prefix:string, spec:string } | null}
 */
export function toPackageAliasSpecifier(toAbs, origExt, ctx) {
  const { packageAliases, workspaceRoot } = ctx
  let best = null
  for (const [prefix, target] of Object.entries(packageAliases)) {
    const targetDir = toPosix(path.join(workspaceRoot, target))
    if (toAbs === targetDir || toAbs.startsWith(`${targetDir}/`)) {
      if (!best || targetDir.length > best.targetDir.length) best = { prefix, targetDir }
    }
  }
  if (!best) return null
  const rest = toAbs === best.targetDir ? '' : toAbs.slice(best.targetDir.length + 1)
  return {
    prefix: best.prefix,
    spec: (rest ? best.prefix + rest : best.prefix.replace(/\/$/, '')) + origExt,
  }
}

/** Does `spec`'s alias/target actually cover `toAbs` for this package? */
export function aliasCovers(prefix, toAbs, ctx) {
  const { aliases, packageDir } = ctx
  const target = aliases[prefix]
  if (target === undefined) return false
  const targetDir =
    target === '.' || target === '' ? packageDir : toPosix(path.join(packageDir, target))
  return toAbs === targetDir || toAbs.startsWith(`${targetDir}/`)
}

/**
 * Resolve `toAbs` (+ optional ext) to a file on disk, trying TS/JS extensions
 * and an `index.*` barrel. Returns the matched candidate path (the string we
 * built, not its real casing) or null.
 */
export function resolveOnDisk(toAbs, origExt) {
  const candidates = origExt
    ? [toAbs + origExt, ...TRY_EXT.map((e) => toAbs + e)]
    : [
        ...TRY_EXT.map((e) => toAbs + e),
        ...TRY_EXT.map((e) => path.join(toAbs, `index${e}`)),
        toAbs,
      ]
  for (const c of candidates) {
    try {
      if (fs.statSync(c).isFile()) return c
    } catch {
      /* keep trying */
    }
  }
  return null
}

/**
 * True when `candidate` exists but only because the filesystem is
 * case-insensitive — the real on-disk path differs in character case. Such a
 * rewrite must be reported but never autofixed.
 */
export function isCaseOnlyMatch(candidate) {
  try {
    return toPosix(fs.realpathSync.native(candidate)) !== toPosix(path.resolve(candidate))
  } catch {
    return false
  }
}
