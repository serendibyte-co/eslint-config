---
name: remaining-lint-check
description: Handle ESLint warnings that survive a pre-commit --fix pass — reported by hooks/report-remaining-lint.js after lint-staged runs, or after any manual `eslint --fix`. Use when a commit's output (or a manual lint run) shows a "Remaining lint findings" block, or when asked to check what's left to fix after auto-fixing.
---

# Remaining lint findings after --fix

`eslint --fix` only fixes what's mechanically safe to rewrite. Everything left
over needs a real decision — a type, a rewritten condition, sometimes nothing
at all if the finding is a false positive. This skill is about how to handle
that leftover set once `hooks/report-remaining-lint.js` (wired into
`.husky/pre-commit`) or a manual `eslint <file>` run surfaces it.

## The core distinction: bug-shaped vs. style-shaped

Not every warning deserves the same response. Before doing anything with a
finding, ask: does this rule exist to catch a real defect, or is it purely a
convention preference?

**Bug-shaped — worth reading the actual code before deciding anything:**
rules like `no-floating-promises`, `no-misused-promises`,
`different-types-comparison`, `no-incorrect-template-string-interpolation`,
`require-array-sort-compare`, `no-array-callback-reference`,
`no-super-linear-backtracking` (ReDoS). These exist because the pattern they
flag has genuinely broken something before. Read the surrounding code. If it's
a real bug, say so plainly and fix it (or flag it prominently if fixing is out
of scope for the current task). If it's a false positive — the rule
misunderstanding a deliberate pattern (raw SQL with literal `{...}` syntax
mistaken for a template placeholder, a `sql` tagged-template import the
type-checker can't see through, a string-array sort where lexicographic order
is actually correct) — say so explicitly and note _why_, don't just silently
downgrade it.

**Style-shaped:** most `unicorn/*`, `sonarjs/prefer-*`, import-sort ordering,
`consistent-type-imports`. These are safe to fix mechanically or downgrade
without the same scrutiny — getting one wrong doesn't hide a defect.

## What to actually do

1. Read the reported findings, grouped by file.
2. For each one, apply the distinction above. For bug-shaped findings,
   actually look at the code — don't pattern-match on the rule name alone.
3. **Report to the user, then ask — don't silently fix and don't silently
   stay quiet.** Summarize what's left (count, which files, which are
   bug-shaped vs. style), and ask whether they want it fixed now. This
   mirrors how `.husky/pre-commit` itself works: the hook can only print
   output, it can't literally ask a question in a chat UI — the agent that
   ran the commit is the one that reads the output and does the asking, in
   its own next turn.
4. If asked to fix: prefer real fixes (add the `await`, narrow the type) over
   reflexive rule suppression. An inline `eslint-disable` is legitimate only
   for a confirmed false positive, and should carry a comment explaining why,
   not just silence the warning.
5. Never disable or downgrade a rule's _severity_ in the shared config to make
   a finding go away — that changes the policy for every project consuming
   this config, not just the one file being fixed. If a rule is genuinely
   miscalibrated for a project's real patterns (not a one-off false
   positive), that's a config change worth raising explicitly, not a silent
   edit made while fixing an unrelated commit.

## What this skill does not cover

Deciding whether a _new_ rule should be added to the shared config, or
whether an existing rule's default severity should change — that's a
decision about `base.js`/`node.js`/`react.js` themselves, made deliberately
in this repo, not something to infer from one project's lint output.
