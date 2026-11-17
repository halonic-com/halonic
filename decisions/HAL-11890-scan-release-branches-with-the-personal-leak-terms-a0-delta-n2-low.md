# Decision: scan release branches with the personal terms

- Approval: the task asks for this change (HAL-11890); Liam approves and signs this note in review
- Kind: internal
- Signature:

## What changes

- `leak-terms.yml` also runs for pull requests into `release/**`, and `ci.yml` also runs on a push to `release/**`.
- The `leak-terms` environment's deployment branch rule must also allow `release/*`. That setting is outside the repo; Chief applies it.

## Why

Commits on a release branch were only scanned without the personal terms. Scanning them like `main` closes the gap.

## Tests

Workflow triggers only: no unit test applies. The first pull request into a `release/*` branch shows the run.

## Covers

- leak-guard
