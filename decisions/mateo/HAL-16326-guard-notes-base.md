# Decision: the note check runs again when a pull request's base changes, and only against main or a release branch

- Task: HAL-16326
- Approval: Liam asked for this change on HAL-16326; it changes `guard-notes.yml`, a trust root of the guard, so Liam and Julian both sign it as guardians
- Kind: user-visible
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:upT5Num7qWLtWtZINJxgebTQ69K7q4HLg2SDzfr24HNfxOz1R+/N3a6d5GkC74s5LZ1h6xIrdEmtKpe/lAdMAw==

## What changes

- `.github/workflows/guard-notes.yml`: the `pull_request_target` trigger adds the `edited`
  type and a `branches: [main, "release/**"]` filter. A new first step fails the run when
  the pull request's or merge group's base is neither `main` nor a `release/` branch.
- The run on `edited` runs the whole check, also for a title or body change, not only when the
  base changed; that is one short job.
- `.github/workflows/pr-details.yml`: the notice on a base change says the note check runs
  again by itself.
- The workflow's header comment and `docs/guides/checks.md` say which run blocks the merge:
  the organisation's required copy, pinned to `refs/heads/main`, which runs on its own triggers
  and in the merge queue against `main`.
- New requirement `check.guard-notes-base` with `tooling/check/src/test/guard-notes-base.test.ts`,
  which reads the workflow's triggers and runs the first step's own shell with a set of base refs.

## Why

The check compares the pull request's head with its base. When the base changed, nothing ran
it again against the new base until the merge queue. The run on `edited` gives an early red on
the pull request after a base change; the gate that blocks the merge stays the required copy's
run against `main` in the queue. The extra run costs one short job on a hosted runner per edit.

## Tests

No test was skipped, weakened or deleted. The new test fails on the workflow before this change.

## Covers

- .github/
- tooling/check/
