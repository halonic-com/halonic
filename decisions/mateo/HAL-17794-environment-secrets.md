# Decision: a workflow reads a secret only in a job with its own environment

- Task: HAL-17794
- Approval: /HAL/issues/HAL-17794 (the task asks for this change; Liam approves this note in review and signs it)
- Kind: internal
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:4/PyTep1yE8g/oGaPKGpKgjg8PB1Et4PImXUfvMEuzvvcYD0fAIhshqsO93HfawMrG9e8NlAa4Et5muNrqanCA==

## What changes

The winget workflow is split into two jobs. The first fills in and validates
the manifests and reads no secret. The second, `submit`, runs in the `winget`
environment, takes the manifests from the first job as an artifact and is the
only job that reads `WINGET_TOKEN`.

A new `environment-secrets` rule in `tooling/check` fails a workflow job that
reads any `secrets.*` other than `GITHUB_TOKEN`, or passes `secrets: inherit`,
without its own `environment:`. A read that a pull request's own run needs, so
that no environment limited to `main` could hold it, carries
`# environment-secrets: allow <reason>` on its line. The one such read today is
`ci.yml`'s `pick-runner` job, whose app key can only list the organisation's
runners.

## Why

A repository secret reaches any run from a branch inside the repository, and
that branch's copy of the workflow decides what to do with it. An environment
limited to `main` and `v*` tags keeps the token out of every other run. The rule
keeps the next workflow from reading a secret outside an environment.

## Tests

`tooling/check/src/test/environment-secrets.test.ts`: a fixture job that reads a
secret without an environment fails, one with an environment passes, and
`GITHUB_TOKEN` and `secrets: inherit` are handled, and an allow comment counts
only with a reason. `pnpm check` reports 0
errors on this branch and flags `main`'s `winget.yml`.

## Covers

- .github/
- tooling/check/
