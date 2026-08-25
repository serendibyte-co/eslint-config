#!/usr/bin/env bash
# Neutralizes a bug seen in some git-worktree setups: a per-worktree config
# override (.git/worktrees/<name>/config.worktree) can hardcode core.hooksPath
# to an ABSOLUTE path pointing at wherever the first checkout of the repo
# lives. Since that absolute path never changes per worktree, every worktree
# with the override silently runs THAT ONE checkout's .husky/pre-commit
# instead of its own — hook changes made on a worktree's branch never
# actually take effect there, only after merging to the checkout the
# override points at.
#
# husky's own install (the `husky` command, run right before this in
# `prepare`) always writes the correct relative form itself
# (`git config core.hooksPath .husky/_`), which self-resolves correctly
# per-checkout. This just clears any worktree-scoped override that would
# otherwise shadow it. Runs on every `bun install` via `prepare`, so a new
# worktree self-heals the moment its dependencies are installed — no manual
# per-worktree fix needed.
#
# Safe everywhere: a no-op if there's no such override (main checkout, or a
# worktree that was never affected).

git config --worktree --unset core.hooksPath 2>/dev/null || true
