# Decision: `pnpm decision sign` reads the test files in one git batch and prints a progress line

- Task: HAL-10493
- Approval: Liam approved the code of PR #2993 on HAL-10493; it changes the guard's own paths, so Liam and Julian sign as the two guardians
- Kind: user-visible
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:ovZIjt94Sk4kWuSnLP+o+FMs1GFGdBCBtsnxT69GTBtc88hYUB7aDipYiPvxlZeGq1Uabnd+Ep1ob5eKd8aVAQ==
- Signature: ed25519:sha256:s6QbTuo7EHJ-9JxW-RnqP0pi0Jq_Jkrdog_YTzYt1lI:wo2bcjyf/LPP6OUAJaInPHtiGCPHWkhGYmah2BCkdj5vHuEGiP3D1XBVWL0fo+6I1hnxqOinsmuCeLmewnQVAw==

## What changes

`pnpm decision sign` and the guard's signature check read the test files at a commit with one
`git cat-file --batch` call instead of one `git` process per file. Reading about 1,700 files
goes from 80-90 seconds to about 0.13 seconds. It prints one progress line on stderr, for
example `reading 1727 files at 0123456789ab`. The signed content (the paths plus their object
IDs) is the same bytes as before, so every existing signature still verifies. No rule or
requirement changes.

## Why

The signing command looked hung for over a minute with no output, and a 120-second tool cap
cut it off (seen while signing the note on halonic#2985, HAL-10460).

## Tests

No test was weakened or skipped. Tests were added for the batch read (missing files, paths with
line breaks, submodule paths that look like a blob answer), for the progress line, and one that
signs with the old per-file read and the new batch read and checks the signed bytes are identical.

## Covers

- tooling/check/
