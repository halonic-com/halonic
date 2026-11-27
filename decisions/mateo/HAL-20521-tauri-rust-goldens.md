# Decision: a file the shell's Rust code reads runs the Tauri jobs

- Approval: Liam approves this note in review on HAL-20521 and signs it
- Kind: internal

## What changes

In `.github/workflows/ci.yml`, the `changes` job's `Find changed areas` step lists the
`packages/` paths quoted in the Rust files under `apps/studio/src-tauri` (the shared goldens
read with `include_str!`, leading `../` removed). When a pull request's or merge group's diff
changes one of them, the step sets `tauri=true` and writes a notice naming the file. The
`tauri` area regex and every other area stay as they were. No trigger, right, runner, secret
or check changes; the change can only run the Tauri jobs more often, never less.

## Why

A golden changed with only its TypeScript side skipped "Tauri shell (Rust checks)" in the
pull request and in the merge group, so the Rust side's drift showed only on main's push run
(HAL-20521, found on #6789). The list comes from the checkout, so a new golden needs no edit
to the workflow.

## Tests

No test was weakened or skipped. The step's block was run locally against `main` with
simulated diffs: a golden alone gives `tauri=true`, a TypeScript file alone `tauri=false`.

## Covers

- .github/
