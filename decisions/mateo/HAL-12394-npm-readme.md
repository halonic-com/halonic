# Decision: the halonic npm package ships a README for users

- Task: HAL-12394
- Approval: Liam reviews this change on HAL-12394 (a team decision with no board card, HAL-2282 rule: the wording comes from the root README the board already approved). He signs this note.
- Kind: user-visible

## What changes

The stager copies `tooling/publish/cli/README.md` into the `halonic` npm package instead of
`apps/cli/README.md`. The new file is written for users: the install line, the 5-minute Acme
quick start and links to docs.halonic.dev, SUPPORT and SECURITY. `apps/cli/README.md` stays the
engineers' notes and is no longer shipped. The requirement `publish.staged-cli` names the README
in the list of files the package holds and gets one new example: the installed package's README
is the one for users. `tooling/publish/README.md` gets two release checks: the npm page shows
Apache-2.0 and the new README once `latest` points to 0.1.0, and the 1.0.0 and 0.0.0-stage
placeholders still say deprecated.

## Why

npm shows a package's README as its page. The engineers' notes ("Layer: apps", "Owner: liam",
"Adding a command") have no install line or quick start, so they would be the first thing a user
reads (C25 claims check, HAL-12389, row N2). No test was weakened or skipped; a test was added
that installs the packed CLI and checks its README.

## Covers

- publish.staged-cli
