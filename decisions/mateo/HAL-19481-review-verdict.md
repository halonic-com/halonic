# Decision: reviewers record verdicts with review_verdict, and one reader judges them

- Task: HAL-19481
- Approval: the board's go on phase 2 of the plan on HAL-19228 (26 Nov), with Liam's changes from HAL-19325; Liam reviews and signs this note, Julian does the security review
- Kind: internal
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:CQeL3WZjssOZ2R6QUlHhDcg+E4gBcPMxcA4FPfaYgxXsnHFR5vA/WoRilp9LD3NwZDyThHOpmDeKxzVHKEg5AA==

## What changes

- New agent tool `review_verdict` (`src/verdicts/review-verdict.ts`, `src/plugin/review-verdict-tool.ts`): the reviewers' agents the board names in `verdictReviewers` record `approved`, `changes-requested`, `withdrawn` or `security-ok` on a pull request's full head, from a run that holds its task. Each verdict is a new plugin entity that is never changed. Requirement `paperclip.review-verdict`.
- New reader `verdictsFor` (`src/verdicts/reader.ts`): full SHA only, an approval carries over a rebase only with the same fingerprint, change requests hold until the same reviewer approves or withdraws, a failed read is `unknown`. No gate reads it yet. Requirement `paperclip.verdicts-reader`.
- New capability `issues.checkout`, used only for `assertCheckoutOwner` on the calling run.
- `changeIdOf` and `sameChanges` (`src/pr-watcher/rebase-only.ts`): a renamed file GitHub lists without a patch counts by its blob instead of as unchanged, so a change hidden behind the missing patch no longer carries an approval. This is stricter for the PR watcher's rebase-only check and the Merger's carry-over. Requirements `paperclip.pr-watcher-rereview` and `paperclip.merge-control-carry-over`.
- `queue_state` and `merge_speed` declarations move from `manifest.ts` to `pr-tool-declarations.ts`, unchanged, to keep the manifest under the size limit.

## Why

Phase 2 of the plan on HAL-19228: bind each verdict to the reviewer's own Paperclip run and the exact head, and give every gate one reader. Shadow mode, the gates' move to the reader and the labels follow in their own pull requests.

## Tests

No test was skipped or weakened. New tests for the tool's checks, the author check, the run check, the reader and the store; `rereview.test.ts` adds the renamed-file case. halonic-com/server#100 shows on the image's own code that a finished run can't pass `assertCheckoutOwner`.

## Covers

- tooling/paperclip/
- paperclip.review-verdict
- paperclip.verdicts-reader
- paperclip.pr-watcher-rereview
- paperclip.merge-control-carry-over
