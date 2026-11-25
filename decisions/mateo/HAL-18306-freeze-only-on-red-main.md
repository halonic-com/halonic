# Decision: any merge group freezes main only when main's push run is red

- Task: HAL-18306
- Approval: https://paperclip.halonic.com/HAL/issues/HAL-18306 (Liam asked for this follow-up on HAL-18287, 25 Nov 08:24 UTC; Liam approves this note in review)
- Kind: internal

`paperclip.merge-control-main-broken` changes for a merge group directly on `main`'s tip.

- The main-red freeze from file annotations starts only when `main`'s newest finished push run is red, for every group, including one with nothing ahead of it. When that run is green, or wasn't read, the pass logs `main-broken suspected, not frozen (main push <sha> green)` once and holds the group's own pull request, as HAL-18287 already did for stacked groups.
- This replaces HAL-18287's rule that a group directly on `main`'s tip that no pull request explains freezes whatever `main` shows. That example in the requirement and its test (`the same failure on a group directly on main's tip, no PR touching the file, is main broken`) are replaced by three cases: push run green, red and not read.
- The Leak guard examples and their tests now say that `main`'s push run is red, which it was on 24 Nov (#5723's files failed on `main` itself). Without that, they would read as "not read" and no longer freeze.
- Why: in the #5969/#5994 incident (merge group runs 45568738718 and 45568740658) the typecheck annotation named `packages/core/action-catalog/src/device-check.ts`, which #5969 doesn't change; it changes `catalog.generated.ts`, which that file imports. The file match can't blame #5969, so its own group, had it been on `main`'s tip, would have frozen the queue while `main` was green.

## Covers

- paperclip.merge-control-main-broken
