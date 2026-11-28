# Decision: release.yml's comments stop claiming the release environments need an approval

- Approval: A0 0.2.0 finding [low] on HAL-20510, fixed by HAL-20859; Liam approves and signs this note in review
- Kind: internal

## What changes

`.github/workflows/release.yml`, comments only. The header no longer says the `release` jobs (sign,
play-upload, play-apk, sign-windows) wait for an approval: it says what gates a real run now, the
environments' branch and tag rules and a person approving a staged npm version with 2FA, and that a
reviewed environment must exist again before any 0.9 release. Two more comments that made the same
claim (the updater key paragraph and the `sign-windows` job) are corrected the same way. No key,
permission, secret, environment, trigger or runner changes.

## Why

Since the board's decision of 25 Nov 2026 (AGENTS.md, "Releases below 0.9"), the `release`,
`npm-publish` and `npm-publish-cli` environments have no required reviewer. A comment that still
promised an approval would mislead whoever reads the workflow before a release.

## Tests

None: comments only. `actionlint` and zizmor run on the file in CI.

## Covers

- .github/
