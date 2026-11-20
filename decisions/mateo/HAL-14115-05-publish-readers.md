# Decision: a pull request that changes published code also runs the publish tests

- Approval: the board's request on HAL-14115 (20 Nov 22:39, "fix the PR-side selection", a queue fix under the HAL-14331 freeze); it changes `tooling/check/src/lib/affected-tests.ts`, a trust root of the guard, so Liam and Julian both sign it as guardians
- Kind: user-visible

## What changes

- `tooling/check/src/lib/affected-tests.ts`: a new list, `publishedCodeReaders`, names the
  packages whose tests bundle the published code without depending on it. Today that is
  only `@halonicjs/tooling-publish`. A second list, `publishedCodePaths`, names what they
  bundle: `packages/` and `apps/cli/` (`stage-cli.test.ts` bundles the CLI and runs it). A
  changed file under one of them that isn't a test file selects their tests too.
  `examplesReaders` names `@halonicjs/tooling-publish` too: the staged CLI ships
  `examples/` and `stage-cli.test.ts` runs `init --example acme`. The per-file part of
  `testSelection` moves into a helper, `packagesReading`, with the same results for every
  other file.
- `tooling/check/requirements/affected-tests.md`: the rule and two examples.

The merge queue and `main` don't change: they test every package, as before. The guard
compares the same selection on both sides, as before.

## Why

On 20 Nov, #4193 changed `packages/core/std` and passed its pull request checks, then failed
every merge group it was in: `tooling/publish`'s `pack.test.ts` and `stage.test.ts` stage the
published layers with every workspace package they reach, and failed on an import that
`@halonicjs/testing` doesn't declare. `tooling/publish` depends on no package under
`packages/`, so the affected tests left its tests out of the pull request's run. Each failed
group rebuilt every group behind it. With this change, #4193's changed files select
`@halonicjs/tooling-publish`, so the pull request fails on its own.

**Not a selection gap: #4145.** Its Tauri Rust checks did run on the pull request, at 08:10,
and passed. `apps/studio/src-tauri/clippy.toml`, which disallows `Command::new`, reached
`main` at 14:49 (#3888). The pull request's result was older than the rule, so this change
can't catch it; the queue gate's age of the result can.

**Not done: the stopgap of testing everything for `packages/core/*` and `packages/testing/*`.**
Most pull requests touch one of those, so nearly every pull request would test every package,
and runners are what the queue waits for now.

## Tests

`affected-tests.test.ts`: a change to code under `packages/` or `apps/cli/`, or to
`examples/`, selects the publish tests; a change to a test file there doesn't, and a change
under `apps/studio/` doesn't.

## Covers

- tooling/check/
