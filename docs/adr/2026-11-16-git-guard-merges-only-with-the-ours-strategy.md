# The git guard lets Get updates merge only with the "ours" strategy

- **Status:** Accepted
- **Date:** 2026-11-16

## Context

Get updates (HAL-10661) is a fast-forward today. When both sides moved, it
stops and changes nothing. To let a person choose per item (Keep mine, Use
Sam's, Keep both, HAL-10666's follow-up 7c) the app needs the other side's
commits, the common ancestor, each item as the other side has it, and a merge
commit with two parents. The guard allowed none of `fetch`, `merge-base`,
`show` or `merge`. A plain `git merge` is the risky one: it runs merge drivers
named in the repository's config, and it writes conflict markers into the
person's files, which the app says it never does. We looked at `checkout
--theirs` after a normal merge (markers are already written by then) and at
building the merge commit with plumbing (`commit-tree`, `read-tree`), which
would open up a much larger part of git.

## Decision

**Four subcommands join the allow-list.** `fetch` takes a remote name and
refs and no URL, with `--no-tags`, `--prune` and `--quiet`, and the runner
gives it the same pinned `--upload-pack` as `pull`. `merge-base` takes
revisions and `--is-ancestor` or `--all`. `show` reads one item as the other
side has it (`show <revision>:<path>`), with `--no-ext-diff` and
`--no-textconv` added as for `log`. `merge` is allowed in one shape only.

**`merge` is `--no-ff --no-commit -s ours <revision>`, or `--abort` alone.**
The `ours` strategy keeps this side's files exactly as they are, never runs a
merge driver and never writes a conflict marker. It only records the other
side as a second parent. The app then writes each chosen item (Use Sam's:
the content from `show`), stages it and makes the commit with `commit -m`,
which is already allowed. Anything else is refused with `merge_not_ours`,
including other strategies, `-X` options, `--squash` and
`--allow-unrelated-histories`.

## Consequences

The guard cannot be made to write conflict markers or run a merge driver
through `merge`. git reads `branch.<name>.mergeOptions` before the command
line and every `-s` adds a strategy rather than replacing one, so a planted
`-s recursive` would be tried first. The runner already refuses a repository
whose own config sets the key. For `merge` only, it also sets an empty
`branch.<name>.mergeoptions` for every such key in the config from any file
(the user's own included), so the strategy list is just `ours`. Without the second parent, the commit would hide the other
side's history, so "no merge without both parents" depends on the app; the
guard cannot enforce it. Tests: `check_args_tests.rs` (the refused forms), `repo_config_tests.rs` and
`tests/runner.rs` (the planted merge options and driver) and
`runner_fetch_tests.rs`, which fetches, finds the base, reads the other side
and merges a file both sides changed, then checks the file is untouched and the
commit has two parents. The `Vcs` port method that returns the items both
sides changed is the next pull request (HAL-10717). Until 7c, the app does not
call any of this: diverged copies still cannot be merged in the app, and the
release notes say so.
