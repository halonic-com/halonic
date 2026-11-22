# Decision: allow a @changesets/git patch that caps parallel git log

- Task: HAL-15966
- Approval: the board asked for the fix on HAL-15966 and fast-tracked #4975 and #4976; Liam reviews them on HAL-15965 and signs this note as the CTO
- Kind: internal
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:xa+sssIaN9RFY9RI9t5KwbgLgOxQJPWH7+jmaaTnfMEnRW5O0h6SrDBPrjOjypNJiQ9ToSvDWi5HTSmwj9qmAA==

## What changes

- `tooling/check/patches-allowed.json`: allows one patch, `patches/@changesets__git@4.0.1.patch`.
- `tooling/check/dependencies.json`: lists `@changesets/git` as a root dev dependency. It is already
  installed as part of `@changesets/cli`; the entry exists only so the patch is pinned to one
  catalog version. Nothing imports it.

The patch itself lands in #4976, on top of this pull request, because CI reads both lists from the
base commit.

## Why

`changeset version` runs one `git log --follow` per pending changeset and starts them all at once.
With 591 changesets on `main` it peaked at 5.6 GB locally and 8.5–9.4 GB in Fast gates, and three
merge-group jobs were killed at the 10 GB ceiling. The patch runs at most 8 at a time: 2.2 GB
however many changesets wait, with byte-identical changelogs.

## Tests

No test was weakened or skipped. The patch was checked by diffing the full `changeset version`
output with and without it on `main`.

## Covers

- tooling/check/
