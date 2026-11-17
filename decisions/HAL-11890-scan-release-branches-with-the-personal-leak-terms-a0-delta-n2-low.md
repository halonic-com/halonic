# Decision: scan release branches with the personal terms

- Approval: the task asks for this change (HAL-11890); Liam approves and signs this note in review
- Kind: internal
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:xvByxjYRuDU55vQ8EWfaS0bXwKd5ZrpPptlLALvVJQ3kHZvfPl4TzcynqSGNK8JEeUbiQu8BGm9YwZm8NVXzCw==

## What changes

- `leak-terms.yml` also runs for pull requests into `release/**`, and `ci.yml` also runs on a push to `release/**`.
- A push to a branch other than `main` (so `release/**`) uses the empty `turbo-cache-read` environment, not `turbo-cache-write`. The signing key's environment is unchanged.
- The Windows sandbox job's `setup-node` step turns off its package-manager cache, like the other `setup-node` steps. A run on a release branch must not restore a cache that a pull request could have written.
- The `leak-terms` environment's deployment branch rule must also allow `release/*`. That setting is outside the repo; Chief applies it.
- `release/0.1.1` already exists and keeps its own copies of `ci.yml` and `leak-terms.yml`, so this change reaches only release branches cut from `main` after it merges. It does not cover 0.1.1.

## Precondition

The environment change waits until a ruleset on `refs/heads/release/*` exists: pull request required, no force-push, no deletion, the `workflows` rule, and branch creation limited to the release owner (bypass for the board's account). Without it, anyone with push access could push a release branch with an edited workflow and read the terms. A pull request into `release/**` runs the release branch's own workflow code, so it needs the same ruleset.

## Why

Commits on a release branch were only scanned without the personal terms. Scanning them like `main` closes the gap.

## Tests

Workflow triggers only: no unit test applies. The first pull request into a `release/*` branch shows the run.

## Covers

- .github/
