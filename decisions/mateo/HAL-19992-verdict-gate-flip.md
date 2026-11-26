# Decision: what must hold before the board turns the verdict flag on

- Task: HAL-19992
- Approval: Julian's security review of #6636 (HAL-19980) named these as conditions for the flag; Liam reviews and signs this note
- Kind: internal

## What changes

1. Path protection. Everything the recorded-verdict gates trust now lives in `tooling/paperclip/src/verdicts/`, which the routine reviewer never approves alone:
   - `verdicts/branch.ts` (new) holds `copyTaskOf` and `branchAgentOf`, the agent and task a branch names. `author.ts` uses `branchAgentOf` instead of the PR watcher's `branchOwner`, and `gate-read.ts`, `import.ts`, `review-verdict.ts` and the shadow comparison import `copyTaskOf` from there. `pr-tools/approval-copy.ts` imports it too.
   - Moved unchanged into `verdicts/`: `plugin/verdict-gate.ts`, `pr-tools/pr-status-verdicts.ts` (with its test) and `plugin/approval-copies.ts`, the agents and comments read behind the gate. `routineExcludedFolders` stays as it is.
2. `decidePass` throws when the settings turn `verdictGate` on and the snapshot has no `recorded` map, so the Merger falls back to its own rules for that pass instead of emptying the queue.
3. With the flag on, a pull request whose records, task comments or agents couldn't be read (or whose records the pass didn't read) is marked unread (`unreadGate`). It is still not approved, so nothing is added, but the removal rule doesn't take a queued one out for "no signed approval", as on a refused GitHub read. Records that were read and don't approve still take it out.

Requirement `paperclip.verdicts-gate` gets one paragraph for 2 and 3, and two examples.

## Why

Julian's review of #6636: the branch reading and the reads behind the gate sat in folders the routine reviewer may approve alone, a Merger that turns the flag on without passing the records would refuse every pull request, and one failed Paperclip read would empty the merge queue.

## Limits

- Turning the flag on in the live Merger, and passing `recorded` into `decidePass`, is the server session's part (HAL-18423).
- A pull request with more files than the snapshot lists is still refused, not unread: that isn't a failed read, and it would come out of the queue as before.
- The `CopyAgent` type stays in `pr-tools/approval-copy.ts`; a type carries no behaviour.
- Not done here: the old paths of renamed plugin manifests in `gateVerdictPullOf` and the comment gate (non-blocking in the review).

## Covers

- paperclip.verdicts-gate
- tooling/paperclip/src/pr-tools/pr-status-verdicts.test.ts

## Tests

No test was skipped or weakened; `pr-status-verdicts.test.ts` moved with its file, unchanged. New:
- `src/merge-control/decide-file.test.ts`: the flag on without `recorded` throws; with `recorded` it answers and adds nothing unapproved.
- `src/verdicts/verdict-gate.test.ts`: a failed agents read removes no queued pull request and adds none; records read with no approval still take the queued one out.
- `src/merge-control/approval-side.test.ts`: a pull request not read this pass is unread, a refusal isn't.
