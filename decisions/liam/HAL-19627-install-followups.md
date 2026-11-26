# Decision: the release notes' install line says `halonic@latest`

- Task: HAL-19627
- Approval: an internal note written by Liam; Julian reviews #6532 on HAL-19627 and signs
- Kind: internal

## What changes

In `.github/workflows/release.yml`, the command-line line of the release notes changes from
`npm install -g halonic` to `npm install -g halonic@latest`. Nothing else in the workflow changes:
no step, permission, token, trigger or publish command.

## Why

On npm, `halonic` 1.0.0 is an empty placeholder. When the `latest` version's `engines` doesn't
match the user's Node.js (older than 26.12), a plain `npm install -g halonic` falls back to the
highest version that does, the placeholder, which installs quietly with no `halonic` command.
With `@latest`, npm installs the tagged version, and `halonic` then says which Node.js it needs.
The README and the docs say `@latest` since #6518 (HAL-19458); this brings the release notes in
line before the next release.

## Tests

No test was skipped, weakened or deleted. The line is text in the release notes only.

## Covers

- .github/
