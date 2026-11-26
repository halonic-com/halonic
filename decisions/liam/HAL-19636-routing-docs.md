# Decision: the reviewer-path requirements name what #6510 changed

- Task: HAL-19636
- Approval: an internal note written by Liam; Mateo checked it on HAL-19638, then Julian signs
- Kind: internal
- Signature: ed25519:sha256:s6QbTuo7EHJ-9JxW-RnqP0pi0Jq_Jkrdog_YTzYt1lI:RFfXKMMRkUl6n4Yb0k9oARUNRrr9vGGJSHsQhySf8u3wDB2ViwhZsgUY2z12/InvXrodGe73eSXiE5bJSyslDw==

## What changes

Three active requirements are edited so they say what the code already does:

- `paperclip.reviewer-paths` names `tooling/paperclip/src/pr-tools/manifests.ts` and
  `tooling/paperclip/src/pr-watcher/rebase-only.ts` among Liam's paths. `liamFiles` in
  `reviewer-paths.ts` has listed both since #6510 (HAL-19585); the requirement didn't.
- `paperclip.pr-watcher-rereview`'s last example says a renamed file without a patch matches when
  its blob is the same, and differs when the blob differs or GitHub gives none; any other file
  without a patch still makes them differ. Before #6474 a renamed file without a patch made the
  changes differ too; the example still said that.
- `paperclip.routine-review` names `tooling/paperclip/src/verdicts/` and the
  `plugin/review-verdict-tool` prefix, which #6510 added to `routineExcludedFolders`.

Alongside them, `reviewer-paths-routine.ts` takes the prefix `plugin/review-verdict-tool` instead
of the single file `plugin/review-verdict-tool.ts`, so `review-verdict-tool.test.ts` leaves routine
review as the `merge-control/` and `verdicts/` tests do; `docs/guides/review.md` and the root
`AGENTS.md` name the same paths in their routine reviewer's list.

## Why

The requirements are the exact lists `docs/guides/review.md` points reviewers to. Lists that miss
two of Liam's paths, or an example that contradicts the comparison the PR watcher runs, would send
a reviewer the wrong way. No rule is relaxed: every edit names a path as more restricted, or
records a comparison already merged and tested.

## Tests

No test was skipped, weakened or deleted. `routine-review.test.ts` gains two rows
(`plugin/review-verdict-tool.test.ts` and `verdicts/review-verdict.test.ts` refuse the routine
role); the `reviewer-paths` and `pr-watcher-rereview` tests are unchanged and pass.

## Covers

- paperclip.reviewer-paths
- paperclip.pr-watcher-rereview
- paperclip.routine-review
