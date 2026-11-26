# Decision: the approval gates read the recorded verdicts behind the board's flag

- Task: HAL-19969
- Approval: the board's go on phase 2 of the plan on HAL-19228 (26 Nov), with Liam's changes from HAL-19325; Liam reviews and signs this note, Julian does the security review
- Kind: internal
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:1Ub8O+Gpnb803ecnyOCf4bajiGAk20PXrSGvnC22xaDzjGOUBSEHOlatTlqe1GrC9y/KNafXAr97bmdgo1dlAg==

## What changes

- A new plugin setting, `verdictGate`, is the board's flag. It is off by default, and anything but `true` counts as off.
- With the flag off, nothing changes: the merge gate and `pr_status` read approvals from PR comments as before. `pr_status` adds one line: "approvals read from: PR comments (the board's verdict flag is off)".
- With the flag on, the merge gate and `pr_status` count only the recorded verdicts (`verdictsFor`), never PR comments. The shared judge is `src/verdicts/gate.ts` (pure, so `decide` stays pure), and the reads are in `gate-read.ts`. The merge-control pass reads each gate pull request's records before `decide` (`withRecordedVerdicts`). With the flag on, the gate also uses the records for:
  - change requests (a recorded hold);
  - Julian's security sign-off (`security-ok` on the exact head);
  - the plugin manifest rule (Julian's recorded approval of the change).
- Julian's minor 2 from HAL-19481: the reader refuses where the Merger does.
  - A changed-files list GitHub gave only part of counts as not approved. That covers more than 100 files in the snapshot, or the REST list falling short of `changed_files`.
  - The author comes from `authorOf` (the hand-over comment on the task), never from the branch name alone.
  - The shadow comparison uses the same judge, so shadow and gate refuse alike.
- Julian's addition from HAL-19968: an approval imported from a Paperclip copy (`importedFrom`) never clears a change request in `holdsOf`. Only an approval or `withdrawn` recorded with `review_verdict` does, so an import that races a change request can't clear it. This also covers records the shadow has already written.
- Fail closed: a failed read of the records, the task's comments, the agents or the pull request leaves it not approved, with the reason. So does a pull request the pass didn't read.

## Why

Step 3 of 2.4 in the plan on HAL-19228. Shadow mode (#6489) compares the two sources. The board turns the flag on once the shadow diff has been clean for 48 hours. After that, the labels (2.3) come next.

## Limits

- With the flag on, the merge gate carries an approval over a rebase only when the snapshot has the head's fingerprint. Today the gate reads that fingerprint only when a GitHub approval line names another head. Without it, the reviewer records a new approval. This fails closed.
- The PR watcher's hints (`handoff`, `wake-status`) still read PR comments. They aren't gates.

## Tests

No test was skipped or weakened. These new tests cover the flag off (the gate row is identical with or without records, and `pr_status` is unchanged except for the flag line), the flag on (records decide, and comments alone don't count), an incomplete file list, the author from `authorOf`, a failed read, holds, the manifest rule and `security-ok`:
- `src/verdicts/gate.test.ts`
- `src/merge-control/approval-side.test.ts`
- `src/pr-tools/pr-status-verdicts.test.ts`

`reader.test.ts` adds an imported approval after a change request (still held) and a recorded one (cleared). The test "lists a recorded approval the gate doesn't see" in `shadow-verdicts.test.ts` now gives the hand-over comment that `authorOf` needs. Two new shadow tests cover the refusals.

## Covers

- tooling/paperclip/
- paperclip.verdicts-gate
- paperclip.verdicts-shadow
- paperclip.verdicts-reader
