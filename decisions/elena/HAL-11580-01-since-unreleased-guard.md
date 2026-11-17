# Decision: the trace check accepts `Since: unreleased`

- Task: HAL-11580
- Approval: Liam asked for this change on HAL-11580 (https://paperclip.halonic.com/HAL/issues/HAL-11580). A team decision with no board card.
- Kind: user-visible

## What changes

The trace check accepts `Since: unreleased` as well as a version. `docs/guides/checks.md` says
what `Since` means and that the release replaces `unreleased` with the real version. No
requirement file changes in this pull request; a second pull request swaps the lines once this
one has merged. One test is added for the new value, and none is weakened or skipped.

## Why

Requirements written after a release tag aren't in that release, and the next version isn't
decided. Today the check only takes a version, so authors guess one. This is a trust-root change
(`tooling/check/src/lib/requirements.ts` is imported by the guard), so it needs two guardian
signatures.

## Covers

- tooling/check/
