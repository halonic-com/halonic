# Decision: the publish job runs in the npm-publish environment

- Task: HAL-11888
- Approval: the task asks for this change; Liam reviews it and signs this note as the CTO
- Kind: internal
- Signature: pending

## What changes

In `.github/workflows/publish-kit.yml`, the `publish` job gets `environment: npm-publish`. A 409 "already staged" for a version the run built now stops the run with a message, instead of being skipped. The release docs add a step: the release owner checks the staged version's provenance (commit and ref) before approving it on npmjs.com.

## Why

The branch rule for a run by hand was a line in the file the run reads from its own branch. An environment's deployment-branch rule is enforced by GitHub, and npm can check the environment name. A skipped 409 could hide a version staged by another run.

## Setup outside this pull request

The board sets the environment's branch rule (`main`, `release/*`), the environment name in the npm trusted-publisher settings of both packages, and a `release/*` ruleset like `main`'s. Until then a publish run is not expected to work, so this merges only together with those settings.

## Tests

None: no test reads workflow files.

## Covers

- .github/
