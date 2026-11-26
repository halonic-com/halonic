# Decision: the recorded verdicts run in shadow next to the gate, and the approvals' Paperclip copies are imported

- Task: HAL-19481
- Approval: the board's go on phase 2 of the plan on HAL-19228 (26 Nov), with Liam's changes from HAL-19325; Liam reviews and signs this note, Julian does the security review
- Kind: internal

## What changes

- Merge control's shadow mode compares, for each open pull request on a new head and every 15 minutes after, the gate's approval rules on GitHub text (`approvalOf`, `changeRequestOf`) with the recorded verdicts (`judgeVerdicts`), and the daily shadow diff lists each pull request where they disagree, with both sides' reasons (`src/merge-control/shadow-verdicts.ts`, `src/plugin/verdict-shadow.ts`). Step 2 of 2.4. Nothing is refused and no gate changes. It runs only once the board has set `verdictReviewers`. Requirement `paperclip.verdicts-shadow`.
- When the gate's approval rules pass, the same check first imports each approval's Paperclip copy (0.1) as a record, once (`src/verdicts/import.ts`). Step 1 of 2.4. Only a copy by the reviewer's agent the settings name, from a run, never edited or deleted, not a receipt, on the task the branch names, naming the current head by all 40 characters with no rebase part, which the same author check and HAL-14809 rules as `review_verdict` allow. The record keeps the comment's id (`importedFrom`), so a copy is never imported twice.
- `review_verdict`: when posting the line on the task fails after the record was stored, the answer now says the verdict was recorded and asks the reviewer to post the line instead of recording again. A timeout no longer claims that nothing was recorded. This is Liam's follow-up from his review of #6474. Requirement `paperclip.review-verdict`.
- Julian's findings from his security review of #6474:
  - `runHolds` checks the task's running runs before `assertCheckoutOwner`, which can hand a free or stale checkout to the calling run.
  - The tool refuses an agent the settings don't name before any read.
  - `readVerdict` accepts only entities scoped to the reader's own company.
  - The manifest's comment on `issues.checkout` now says what that capability can do.
- Julian's findings from his security review of #6489:
  - The import skips a copy when the same reviewer recorded a verdict on the pull request after the copy was written. An import is stored with its own time, so an older approval copy would otherwise clear a newer change request.
  - The shadow routes the pull request as the gate does (`routedOf` in `approval.ts`, now exported): a security or release origin, renamed files' old paths and who wrote it. It passes `routineRefusal` instead of the role that `main` dropped (#6408). When the snapshot lists only some files, Nora's approval can't count, as in the gate.
  - The import and the author check accept only comments whose origin is `comment`, so an origin the server adds later doesn't count.
- `verdictReviewerIds` reads the board's `verdictReviewers` for both the tool and the shadow; an empty id names nobody.

## Why

Steps 1 and 2 of 2.4 in the plan on HAL-19228: shadow mode ends after 48 hours with zero unexplained differences, and the import keeps the approvals reviewers already gave from having to be given again. The gates move to the reader behind the board's flag in the next pull request, then the labels (2.3).

## Tests

No test was skipped or weakened. New tests cover the import's checks (edited, deleted, receipt, no run, another agent, short or older head, no hand-over, own pull request, once only), the comparison in both directions, a failed read as `unknown`, the 15-minute recheck and the diff text. `review-verdict.test.ts` adds the failed post after the record. New tests cover a copy older than the reviewer's newer change request and an origin that isn't `comment`; the author-check fixtures now carry `origin: "comment"`.

## Covers

- tooling/paperclip/
- paperclip.verdicts-shadow
- paperclip.review-verdict
