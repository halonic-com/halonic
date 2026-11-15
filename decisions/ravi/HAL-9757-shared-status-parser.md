# Decision: the porcelain v2 status parser moves to one place, so its tests move with it

- Task: HAL-9757
- Approval: Liam decided on HAL-9757 (https://paperclip.halonic.com/HAL/issues/HAL-9757) to replace the Studio's copy with one shared parser; Julian reviewed it on HAL-10197. A team decision with no board card (HAL-2282 rule), Liam signs this note as the CTO.
- Kind: internal
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:XEKxGV5I2W78+vd8t5NBX3jjEy4MJkJxCIq6ckz7x8OcEb9GKdVMy38chwk2KjXWV/XtFFT/CeRrM3ISwJYqCg==

## What changes

`parseStatus` now lives once in `@halonicjs/ports` (`vcs-status.ts`). adapter-git decodes its Buffer and calls it; the Studio's copy (`apps/studio/src/changes/parse-status.ts`) is deleted, and so is its test file.

The parser tests moved to `packages/ports` under the new requirement `ports.vcs-status-output`. The one status test and its three expect calls that stayed in adapter-git's `git-output.test.ts` shrink the count of `git.vcs` by exactly the tests that moved. Nothing was weakened or skipped: every case still runs, now next to the parser.

## Why

Two copies of one parser can drift apart. One copy, tested once, cannot.

## Covers

- apps/studio/src/changes/parse-status.test.ts
- packages/adapters/git/src/git-output.test.ts
- git.vcs
