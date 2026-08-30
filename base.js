// Shared ESLint flat-config base: type-aware TypeScript linting, sonarjs,
// security, regexp, promise, unicorn, import sorting, and consistent type
// imports. node.js and react.js both build on this — it has no React/Worker/
// Bun-specific pieces of its own.
//
// Ported from matchbox21's eslint.base.js + the wiring every one of its 7
// eslint.config.js files repeated by hand (extends array, plugin
// registration, languageOptions). That repetition is exactly what this
// package exists to remove — a consuming project's own eslint.config.js
// should just be `export default node({ tsconfigRootDir: import.meta.dirname })`.
//
// Severity note: everything downgraded to 'warn' below is downgraded because
// it had *some* real violation somewhere across matchbox21's codebase when
// this was extracted — not because the rule doesn't matter. A fresh project
// starting from this config may find these are all clean and can promote
// them to 'error' immediately; that's a call for that project to make, not
// something this package assumes.

import js from '@eslint/js'
import tseslint from 'typescript-eslint'
import sonarjs from 'eslint-plugin-sonarjs'
import security from 'eslint-plugin-security'
import regexp from 'eslint-plugin-regexp'
import promise from 'eslint-plugin-promise'
import unicorn from 'eslint-plugin-unicorn'
import eslintComments from '@eslint-community/eslint-plugin-eslint-comments'
import noSecrets from 'eslint-plugin-no-secrets'
import simpleImportSort from 'eslint-plugin-simple-import-sort'
import boundariesPlugin from 'eslint-plugin-boundaries'
import { createTypeScriptImportResolver } from 'eslint-import-resolver-typescript'

export { default as boundaries } from 'eslint-plugin-boundaries'

// typescript-eslint rules from `recommendedTypeChecked` that commonly have
// pre-existing violations in a real codebase — type-aware promise/any-flow
// analysis surfaces a lot on first adoption.
export const typeCheckedRules = {
  '@typescript-eslint/no-misused-promises': 'warn',
  '@typescript-eslint/no-floating-promises': 'warn',
  '@typescript-eslint/no-unsafe-assignment': 'warn',
  '@typescript-eslint/no-unsafe-call': 'warn',
  '@typescript-eslint/no-unsafe-member-access': 'warn',
  '@typescript-eslint/no-unsafe-argument': 'warn',
  '@typescript-eslint/no-unsafe-return': 'warn',
  '@typescript-eslint/restrict-template-expressions': 'warn',
  '@typescript-eslint/no-unnecessary-condition': 'warn',
  '@typescript-eslint/no-base-to-string': 'warn',
  '@typescript-eslint/require-await': 'warn',
  '@typescript-eslint/await-thenable': 'warn',
  '@typescript-eslint/no-unnecessary-type-assertion': 'warn',
  '@typescript-eslint/prefer-promise-reject-errors': 'warn',
  '@typescript-eslint/only-throw-error': 'warn',
  '@typescript-eslint/unbound-method': 'warn',
  // `any` is already banned by no-explicit-any in `recommended` (error).
  // `unknown` has no built-in ban — narrow to a real type instead of
  // reaching for either escape hatch.
  '@typescript-eslint/no-restricted-types': [
    'warn',
    { types: { unknown: 'Use a specific type or a discriminated union instead of unknown.' } },
  ],
  '@typescript-eslint/consistent-type-imports': ['warn', { prefer: 'type-imports' }],
}

export const sonarErrorDowngrades = {
  'sonarjs/cognitive-complexity': 'warn', // default threshold: 15
  'sonarjs/no-nested-functions': 'warn',
  'sonarjs/max-switch-cases': 'warn',
  'sonarjs/prefer-specific-assertions': 'warn',
}

// Sonar rules sonarjs.configs.recommended ships *off* — enabled here at
// Sonar's own server-side defaults.
export const sonarOptInRules = {
  'sonarjs/cyclomatic-complexity': 'warn', // default threshold: 10
  'sonarjs/nested-control-flow': 'warn', // default max depth: 3
  'sonarjs/max-lines': 'warn', // default: 1000
  'sonarjs/max-lines-per-function': 'warn', // default: 200
  'sonarjs/expression-complexity': 'warn', // default max nesting: 3
}

export const promiseErrorDowngrades = {
  'promise/always-return': 'warn',
}

// eslint-plugin-regexp's flat/recommended rules that had real violations in
// matchbox21. no-super-linear-backtracking in particular is a genuine
// ReDoS-risk finding, not style — worth checking each hit per project, not
// dismissing as routine cleanup.
export const regexpErrorDowngrades = {
  'regexp/no-super-linear-backtracking': 'warn',
  'regexp/no-unused-capturing-group': 'warn',
  'regexp/prefer-predefined-assertion': 'warn',
  'regexp/no-dupe-characters-character-class': 'warn',
  'regexp/use-ignore-case': 'warn',
}

// eslint-plugin-no-secrets has no flat config export — wire the single rule
// manually. Entropy-based; tolerance tuned up from the library default to
// avoid flagging UUIDs/hashes in test fixtures as secrets.
export const noSecretsRules = {
  'no-secrets/no-secrets': ['warn', { tolerance: 4.5 }],
}

export const importSortRules = {
  'simple-import-sort/imports': 'warn',
  'simple-import-sort/exports': 'warn',
}

// Optional stricter file/function length ceiling (300 lines/file, 50 or 150
// per function) beyond sonarjs's looser defaults above. Off by default —
// call strictLengthRules({ tsx: true }) from a consuming config and spread
// the result in if you want it, scoped to your own production-code files
// (exclude *.test.ts, data/fixture directories yourself, same as
// matchbox21 does per-package).
export function strictLengthRules({ tsx = false } = {}) {
  return {
    'max-lines': ['warn', { max: 300, skipBlankLines: true, skipComments: true }],
    'max-lines-per-function': [
      'warn',
      { max: tsx ? 150 : 50, skipBlankLines: true, skipComments: true },
    ],
  }
}

// eslint-plugin-unicorn's flat/recommended, with the rules turned off/
// reconfigured because they fight standard TS/React/Node conventions rather
// than catching real issues, plus the rules that had real violations
// somewhere in matchbox21 downgraded to 'warn'.
export const unicornRules = {
  // Flags standard, readable names (req, res, err, props, ctx, i, ref).
  'unicorn/prevent-abbreviations': 'off',
  // Insists on undefined over null; unrealistic against React (a valid
  // component return), JSON APIs, Postgres, and GraphQL.
  'unicorn/no-null': 'off',
  // Banning reduce outright is dogmatic — it has legitimate, readable uses.
  'unicorn/no-array-reduce': 'warn',
  // Both insist `err` be renamed `error` — same objection as
  // prevent-abbreviations above.
  'unicorn/catch-error-name': 'off',
  'unicorn/name-replacements': 'off',
  // Conflicts with Prettier's own ternary formatting and non-trivial JSX
  // conditionals.
  'unicorn/no-nested-ternary': 'off',
  // Default is strict kebab-case, which breaks PascalCase React components.
  // Allow the case styles a real project typically has in play.
  'unicorn/filename-case': [
    'warn',
    { cases: { kebabCase: true, pascalCase: true, camelCase: true } },
  ],
  'unicorn/import-style': 'warn',
  'unicorn/isolated-functions': 'warn',
  'unicorn/max-nested-calls': 'warn',
  'unicorn/no-array-sort': 'warn',
  'unicorn/no-await-expression-member': 'warn',
  'unicorn/no-for-each': 'warn',
  'unicorn/no-negated-condition': 'warn',
  'unicorn/no-process-exit': 'warn',
  'unicorn/prefer-await': 'warn',
  'unicorn/prefer-string-raw': 'warn',
  'unicorn/prefer-string-repeat': 'warn',
  'unicorn/prefer-top-level-await': 'warn',
  'unicorn/text-encoding-identifier-case': 'warn',
  'unicorn/consistent-boolean-name': 'warn',
  'unicorn/prefer-global-this': 'warn',
  'unicorn/prefer-minimal-ternary': 'warn',
  'unicorn/prefer-query-selector': 'warn',
  'unicorn/prefer-switch': 'warn',
  // Exists to catch a real bug class (extra (index, array) args reaching a
  // callback that doesn't expect them, à la `.map(parseInt)`) — worth
  // checking each hit rather than dismissing as style.
  'unicorn/no-array-callback-reference': 'warn',
  // These three fire heavily on globalThis.fetch/localStorage mocking in
  // test files — standard, intentional test setup, not real global mutation.
  'unicorn/no-global-object-property-assignment': 'warn',
  'unicorn/no-top-level-assignment-in-function': 'warn',
  'unicorn/no-unnecessary-global-this': 'warn',
  'unicorn/no-computed-property-existence-check': 'warn',
  'unicorn/numeric-separators-style': 'warn',
  'unicorn/prefer-code-point': 'warn',
  'unicorn/prefer-early-return': 'warn',
  'unicorn/prefer-export-from': 'warn',
  'unicorn/prefer-includes-over-repeated-comparisons': 'warn',
  'unicorn/prefer-response-static-json': 'warn',
  'unicorn/prefer-simple-condition-first': 'warn',
  'unicorn/prefer-string-replace-all': 'warn',
  'unicorn/consistent-conditional-object-spread': 'warn',
  'unicorn/consistent-function-scoping': 'warn',
  'unicorn/no-break-in-nested-loop': 'warn',
  'unicorn/no-declarations-before-early-exit': 'warn',
  'unicorn/no-non-function-verb-prefix': 'warn',
  'unicorn/no-object-as-default-parameter': 'warn',
  'unicorn/no-top-level-side-effects': 'warn',
  'unicorn/no-useless-else': 'warn',
  'unicorn/prefer-iterator-to-array': 'warn',
  'unicorn/prefer-number-is-safe-integer': 'warn',
  'unicorn/prefer-string-slice': 'warn',
  'unicorn/no-for-loop': 'warn',
  'unicorn/no-lonely-if': 'warn',
  'unicorn/no-negated-array-predicate': 'warn',
  'unicorn/no-unreadable-for-of-expression': 'warn',
  'unicorn/no-useless-coercion': 'warn',
  'unicorn/no-zero-fractions': 'warn',
  'unicorn/operator-assignment': 'warn',
  'unicorn/prefer-at': 'warn',
  'unicorn/prefer-else-if': 'warn',
  'unicorn/prefer-spread': 'warn',
  // Checked before downgrading in matchbox21: hits there were all sorting
  // string arrays for order-independent test comparison, not the
  // numeric-sort footgun the rule targets. Still worth a look per project.
  'unicorn/require-array-sort-compare': 'warn',
  'unicorn/no-duplicate-loops': 'warn',
  'unicorn/no-immediate-mutation': 'warn',
  // Checked before downgrading in matchbox21: hits there were all Postgres's
  // own '{key}' JSONB path-array syntax inside raw SQL, misread as a
  // forgotten `$`. Re-check per project if you build raw SQL strings.
  'unicorn/no-incorrect-template-string-interpolation': 'warn',
  'unicorn/no-unnecessary-boolean-comparison': 'warn',
  'unicorn/no-useless-collection-argument': 'warn',
  'unicorn/prefer-boolean-return': 'warn',
  'unicorn/prefer-continue': 'warn',
  'unicorn/prefer-direct-iteration': 'warn',
  'unicorn/prefer-single-call': 'warn',
  'unicorn/prefer-type-error': 'warn',
}

/**
 * Shared base — type-aware TS linting, sonarjs, security, regexp, promise,
 * unicorn, import-sort, boundaries, consistent-type-imports. No globals/
 * runtime wiring of its own beyond what every consumer needs; node()/react()
 * add the rest.
 *
 * @param {{
 *   tsconfigRootDir: string,
 *   files?: string[],
 *   boundaries?: Parameters<typeof resolveBoundariesConfig>[0],
 *   extraRules?: Record<string, unknown>,
 * }} options
 */
export function base({ tsconfigRootDir, files = ['**/*.ts'], boundaries, extraRules = {} }) {
  if (!tsconfigRootDir) {
    throw new Error('@serendibyte-co/eslint-config: base() requires { tsconfigRootDir }')
  }
  const boundariesConfig = resolveBoundariesConfig(boundaries)
  return tseslint.config({
    extends: [
      js.configs.recommended,
      ...tseslint.configs.recommendedTypeChecked,
      sonarjs.configs.recommended,
      security.configs.recommended,
      regexp.configs['flat/recommended'],
      promise.configs['flat/recommended'],
      unicorn.configs['flat/recommended'],
    ],
    files,
    languageOptions: {
      ecmaVersion: 2022,
      parserOptions: { projectService: true, tsconfigRootDir },
    },
    plugins: {
      '@eslint-community/eslint-comments': eslintComments,
      'no-secrets': noSecrets,
      'simple-import-sort': simpleImportSort,
      boundaries: boundariesPlugin,
    },
    settings: {
      'import/resolver': {
        typescript: {
          alwaysTryTypes: true,
          project: `${tsconfigRootDir}/tsconfig.json`,
        },
      },
      ...boundariesConfig.settings,
    },
    rules: {
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
      ...eslintComments.configs.recommended.rules,
      ...noSecretsRules,
      ...typeCheckedRules,
      ...sonarErrorDowngrades,
      ...sonarOptInRules,
      ...regexpErrorDowngrades,
      ...promiseErrorDowngrades,
      ...importSortRules,
      ...unicornRules,
      ...boundariesConfig.rules,
      ...extraRules,
    },
  })
}

/**
 * Normalizes user-supplied boundaries options into ESLint settings and rules.
 *
 * @param {{
 *   elements?: Array<Record<string, unknown>>,
 *   files?: Array<Record<string, unknown>>,
 *   policies?: Array<Record<string, unknown>>,
 *   rules?: Array<Record<string, unknown>> | Record<string, unknown>,
 *   dependenciesOptions?: Record<string, unknown>,
 *   default?: 'allow' | 'disallow',
 *   severity?: 'warn' | 'error' | 'off',
 *   ignore?: string[],
 *   include?: string[],
 *   noUnknownFiles?: 'warn' | 'error' | 'off',
 *   noUnknownDependencies?: 'warn' | 'error' | 'off',
 *   noIgnoredDependencies?: 'warn' | 'error' | 'off',
 * } | undefined} boundaries
 */
export function resolveBoundariesConfig(boundaries) {
  if (!boundaries) {
    return { settings: {}, rules: {} }
  }

  const settings = {}
  const rules = {}

  if (boundaries.elements) settings['boundaries/elements'] = boundaries.elements
  if (boundaries.files) settings['boundaries/files'] = boundaries.files
  if (boundaries.ignore) settings['boundaries/ignore'] = boundaries.ignore
  if (boundaries.include) settings['boundaries/include'] = boundaries.include

  const policies = boundaries.policies ?? boundaries.rules
  if (policies) {
    const policyOptions = Array.isArray(policies)
      ? {
          default: boundaries.default ?? 'disallow',
          policies,
          ...(boundaries.dependenciesOptions ?? {}),
        }
      : policies
    rules['boundaries/dependencies'] = [boundaries.severity ?? 'warn', policyOptions]
  } else if (boundaries.dependenciesOptions) {
    rules['boundaries/dependencies'] = [
      boundaries.severity ?? 'warn',
      boundaries.dependenciesOptions,
    ]
  }

  if (boundaries.noUnknownFiles) {
    rules['boundaries/no-unknown-files'] = boundaries.noUnknownFiles
  }
  if (boundaries.noUnknownDependencies) {
    rules['boundaries/no-unknown-dependencies'] = boundaries.noUnknownDependencies
  }
  if (boundaries.noIgnoredDependencies) {
    rules['boundaries/no-ignored-dependencies'] = boundaries.noIgnoredDependencies
  }

  return { settings, rules }
}

/**
 * Generates rules enforcing relative paths inside a module and absolute aliases outside.
 * - Files at module root (e.g. src/module/*.ts or src/*.ts) cannot use `../` (must use `./` for siblings, `@/` for external).
 * - Files in module subdirectories (e.g. src/module/sub/**) can use `../` to reach their module root, but cannot use `../../` to escape the module.
 *
 * @param {{
 *   severity?: 'warn' | 'error' | 'off',
 *   rootFiles?: string[],
 *   subFiles?: string[],
 * }} [options]
 */
export function boundaryPathRules({
  severity = 'warn',
  rootFiles = ['src/*.ts', 'src/*.tsx', 'src/*/*.ts', 'src/*/*.tsx'],
  subFiles = ['src/*/*/**/*.ts', 'src/*/*/**/*.tsx'],
} = {}) {
  return [
    {
      files: rootFiles,
      rules: {
        'no-restricted-imports': [
          severity,
          {
            patterns: [
              {
                group: ['../*'],
                message:
                  'Module root and src-level files must use absolute alias (@/...) for external dependencies instead of relative parent imports (../).',
              },
            ],
          },
        ],
      },
    },
    {
      files: subFiles,
      rules: {
        'no-restricted-imports': [
          severity,
          {
            patterns: [
              {
                group: ['../../*'],
                message:
                  'Submodules must not use multi-level parent traversals (../../) to escape their module. Use @/ instead.',
              },
            ],
          },
        ],
      },
    },
  ]
}
