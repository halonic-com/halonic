# Decision: a personal-term allow entry may excuse one old commit in one file

- Task: HAL-10997
- Approval: the board decided on HAL-10997 (https://paperclip.halonic.com/HAL/issues/HAL-10997#comment-87ff1d1b-c3ef-42ba-bd52-4fe928848147) on 19 Nov to keep the flagged old commits in history, and to let the leak guard skip those commits only, so the full scan still catches new hits. Liam reviews it and signs this note as the CTO.
- Kind: internal
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:3Y4ACoNixEL7/w+yB8E0bvXrIe5ebbDiYMvNmen6TUnios/2XoBE5zV9klYzfzRXnLhaZVfRCbFUdInOvZnYCg==

## What changes

`tooling/check/leak-allow.txt` now takes a `personal-term` entry, but only with `commit:<hash>` and the exact file path: no glob, no `root:`, no fingerprint. The entry excuses the term in that one commit and that one file. The same term in any other commit or file, in a commit message, in a file name or in a pull request is still refused. Before, the guard refused every `personal-term` entry.

The allow file gets one entry for each old commit and file the weekly full scan flagged, 21 in all, and one more `/tmp` entry for the old `packages/testing/parity/README.md` example, like the two that are already there. Every flagged file's current version is clean.

The guide `docs/guides/leak-guard.md` says when such an entry is right.

## Why

The weekly full scan (`pnpm check:leaks --all`) reads every commit on every branch and pull request head. Old commits that the repo owners chose to keep in history would fail it every week, so it would stop catching new hits. A commit pin keeps the exception to those commits: a new commit always has a new hash.

## Tests

No test was skipped or weakened. `allow.test.ts` gains tests that a `personal-term` entry matches only its own commit and file, and that one without a commit, with a root, with a glob or with a fingerprint is refused. `scan.test.ts` gains a test that the scanner skips the term only in the named commit and file. With the term list loaded, `pnpm check:leaks --all` is clean on this branch over every branch, tag and pull request head.

## Covers

- tooling/check/
- docs/guides/
