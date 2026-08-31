#!/usr/bin/env bun
// Runs after lint-staged's --fix pass in .husky/pre-commit. Re-lints just the
// staged files (no --fix) and prints whatever remains — warnings that aren't
// mechanically fixable and need a real decision (a type, a rewritten
// condition, etc.).
//
// This exists so whoever — or whichever agent — runs the commit sees exactly
// what's left on the file(s) they just touched, scoped to those files only,
// not the whole package. Always exits 0: it's a report, never a gate.
//
// Unlike the bash version this was ported from (which hardcoded one repo's
// workspace list), this reads workspaces from the consuming project's own
// package.json — no per-project edits needed.

import { $ } from 'bun'

async function main() {
  const staged = (await $`git diff --cached --name-only --diff-filter=ACM`.text())
    .split('\n')
    .filter(Boolean)
  if (staged.length === 0) return

  const pkg = await Bun.file('package.json').json()
  /** @type {string[]} */
  const workspaces = (pkg.workspaces ?? []).map((w) => w.replace(/\/\*+$/, ''))

  /** @type {Map<string, string[]>} */
  const byWorkspace = new Map()
  /** @type {string[]} */
  const rootFiles = []

  for (const file of staged) {
    if (!/\.tsx?$/.test(file)) continue
    const ws = workspaces.find((w) => file === w || file.startsWith(`${w}/`))
    if (ws) {
      const rel = file.slice(ws.length + 1)
      byWorkspace.set(ws, [...(byWorkspace.get(ws) ?? []), rel])
    } else {
      rootFiles.push(file)
    }
  }

  for (const [ws, files] of byWorkspace) {
    await reportOn(files, { cwd: ws })
  }
  if (rootFiles.length > 0) {
    await reportOn(rootFiles, {})
  }
}

/** @param {string[]} files @param {{ cwd?: string }} opts */
async function reportOn(files, { cwd }) {
  const proc = Bun.spawn(['bunx', 'eslint', ...files], {
    cwd: cwd ? cwd : undefined,
    stdout: 'pipe',
    stderr: 'pipe',
  })
  const [out, err] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
  ])
  await proc.exited
  const output = (out + err).trim()
  if (!output) return
  const label = cwd ? cwd : 'root'
  console.log(`\n── Remaining lint findings in ${label} (not auto-fixable) ──`)
  console.log(output)
}

await main()
