# Decision: a head that failed a merge group stays held when main is blamed

- Task: HAL-18340
- Approval: https://paperclip.halonic.com/HAL/issues/HAL-18340 (Chief's requirement from the research session's CI sweep, fix 10, HAL-10, 25 Nov 09:04 UTC; Liam approves this note in review)
- Kind: internal

## What changes

- `paperclip.merge-control-culprit-hold`: main being broken is no longer an exception. When a group fails only on files its pull request doesn't change and `main`'s push run is red, main is recorded as broken and the freeze starts as before, and the group's own pull request is also held on that head, with the usual comment, until it has a new head. A new example replays #5969.
- `paperclip.merge-control-main-broken`: "shall not hold the pull request" becomes "shall still hold the pull request on that head". Its first and last examples say so. In `main-broken.test.ts` the three main-broken cases now expect the group's own head in `failedHeads` instead of `{}`, and the Leak guard case expects one comment, on #5762, instead of none. No test, example or `expect` is removed.
- The #5969 case is plain JSON (`tooling/paperclip/src/merge-control/fixtures/same-head-5969.json`), so the Merger's own tests prove the same rule from the same file (Chief, HAL-17912, 25 Nov 09:16 UTC).

## Why

On 25 Nov #5969's group 45566729803 failed in adapters-core on files #5969 doesn't change. The Merger blamed main and didn't hold it, so it went back in on the same head at 07:30:41. Group 45568738718 failed again and took #5994's group with it, 11 failed groups in all. Holding a head that failed costs one rebase when main really was broken. Not holding it costs every group built on it. The freeze still decides what goes in while main is red; the hold only keeps that head out after the freeze ends.

## Covers

- paperclip.merge-control-culprit-hold
- paperclip.merge-control-main-broken
