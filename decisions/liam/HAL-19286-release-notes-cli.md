# Decision: release notes say how to install the command line; the CLI publish dry run runs in the clean folder

- Approval: the task asks for this change (HAL-19286); Liam wrote it, so Julian approves and signs this note in review
- Kind: internal

## What changes

- The release-notes step in `release.yml` adds two lines after the download line, for real, unsigned and dry-run bodies alike: how to install the command line (`npm install -g halonic`, Node.js 26.12 or later, `halonic init --example acme`, a link to Getting started), and a "What changed" link to `apps/studio/CHANGELOG.md` at the release's own tag. The wording copies the published npm README. Releases already published keep their body.
- In "Check the CLI package in a clean folder", `npm publish --dry-run` now runs in the step's empty temporary folder instead of the repo root. At the root npm refuses with `EBADDEVENGINES`, because the root `package.json`'s `devEngines` asks for pnpm, so every release run from `main` failed at that step.

## Why

A user who arrives through GitHub Releases learned nothing about the command line or what changed (HAL-19280). The dry-run fix unblocks the release workflow itself.

## Tests

Workflow steps only: no unit test applies. The release-notes script was run locally for every signed and dry-run combination, and npm's refusal at the root and success in an empty folder were reproduced locally. A `v0.0.0-test.*` dry run shows the draft body once the separate CLI bundle fix (HAL-19380) lands.

## Covers

- .github/
