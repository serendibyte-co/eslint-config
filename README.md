# @serendibyte-co/eslint-config

Shared ESLint flat-config presets: type-aware TypeScript linting, security,
regexp/ReDoS, promise, unicorn, import sorting, and consistent type imports —
plus `node`/`react` presets layering on the runtime-specific pieces.

Extracted from [matchbox21](https://github.com/Rajitha/matchbox21)'s working
config after a full audit against industry rule sets (sonarjs, security,
regexp, promise, unicorn) and a sibling project's config — see this repo's
CHANGELOG for what's in each preset and why.

## Install

Public repo, consumed via a git-URL dependency — no registry, no auth.

```bash
bun add -D git+https://github.com/serendibyte-co/eslint-config.git#v1.0.0
```

## Use

**Node / Bun / Cloudflare Workers backend:**

```js
// eslint.config.js
import { node } from '@serendibyte-co/eslint-config/node'
export default node({ tsconfigRootDir: import.meta.dirname })
```

Options: `runtime` (`'worker'` default, or `'bun'`/`'node'`), `files`, `boundaries`,
`extraRules`.

**React / Vite frontend:**

```js
// eslint.config.js
import { react } from '@serendibyte-co/eslint-config/react'
export default react({ tsconfigRootDir: import.meta.dirname })
```

Options: `reactVersion` (`'19'` default), `files`, `boundaries`, `extraRules`.

Both presets already include Prettier conflict-resolution
(`eslint-config-prettier`) — don't add it again in the consuming project.

### Architecture boundaries (eslint-plugin-boundaries)

`base`, `node`, and `react` presets include `eslint-plugin-boundaries` and TypeScript path resolution. You can define architectural boundaries either directly in standard flat config or via the inline `boundaries` option:

**Standard Flat Config syntax:**

```js
// eslint.config.js
import { node } from '@serendibyte-co/eslint-config/node'

export default [
  ...node({ tsconfigRootDir: import.meta.dirname }),
  {
    settings: {
      'boundaries/elements': [
        { type: 'helpers', pattern: 'src/helpers/*' },
        { type: 'services', pattern: 'src/services/*' },
      ],
    },
    rules: {
      'boundaries/dependencies': [
        'error',
        {
          default: 'disallow',
          policies: [
            {
              from: { element: { type: 'services' } },
              allow: [{ to: { element: { type: 'helpers' } } }],
            },
          ],
        },
      ],
    },
  },
]
```

**Inline `boundaries` option:**

```js
export default node({
  tsconfigRootDir: import.meta.dirname,
  boundaries: {
    elements: [
      { type: 'helpers', pattern: 'src/helpers/*' },
      { type: 'services', pattern: 'src/services/*' },
    ],
    policies: [
      {
        from: { element: { type: 'services' } },
        allow: [{ to: { element: { type: 'helpers' } } }],
      },
    ],
  },
})
```

## Pre-commit hooks

```json
// package.json
"lint-staged": "node_modules/@serendibyte-co/eslint-config/hooks/lint-staged.js",
"scripts": {
  "prepare": "husky && bun node_modules/@serendibyte-co/eslint-config/hooks/fix-hooks-path.sh"
}
```

```bash
# .husky/pre-commit
bunx lint-staged
bun node_modules/@serendibyte-co/eslint-config/hooks/report-remaining-lint.js
```

If your workspace names/extensions aren't the default, write a small wrapper
instead of the plain string form — see `hooks/lint-staged.js` for the options.

## Agent skill

```bash
npx skills add serendibyte-co/eslint-config --skill remaining-lint-check
```

Teaches an agent how to handle what `report-remaining-lint.js` surfaces —
distinguishing findings worth a closer look from routine style cleanup, and
reporting + asking rather than silently fixing or silently staying quiet.

## Versioning

Bun does not resolve semver _ranges_ on git dependencies — only an exact
`#<tag>` pin. So:

- Tag releases `v1.0.0`, `v1.1.0`, `v2.0.0`, etc.
- Consuming projects pin to an exact tag and bump it manually when they want
  the update.
- A rule newly flipped from `warn` to `error` (or a brand-new rule added at
  `error`) → minor bump at least, since it can fail an existing consumer's
  CI. A preset's exported shape changing → major.

## Release checklist

1. Edit `base.js`/`node.js`/`react.js`/`hooks/*`.
2. Run `bun run test` (lints `test/*.ts`/`*.tsx` against the presets — the
   package's own smoke test) and confirm CI is green.
3. Update this README if a preset's options or the hooks setup changed.
4. **Bump the `version` field in `package.json` to match the tag you're
   about to push** — consumers don't resolve it (git-URL deps pin an exact
   tag/commit, not this field), but tooling like `bun pm ls` reads it, and a
   stale value is confusing. Do this in the same commit as the fix/feature,
   not as an afterthought once the tag's already been decided.
5. Commit, push.
6. `git tag vX.Y.Z && git push --tags` — the tag must match step 4's version
   exactly. Tags are immutable once pushed; if you tag before noticing a
   mismatch, fix forward with a new patch version rather than retagging.

## Rule severity policy

Everything a rule set surfaces that had a real violation somewhere in the
codebase this was extracted from starts at `warn`, not `error` — a project
adopting this fresh may find those are all clean and can promote immediately;
that's a call for that project, not assumed here. See inline comments in
`base.js` for the specific rules and why each is where it is.
