# Decision: the PR watcher records a carried-over approval and returns an answered change request to its reviewer

- Task: HAL-18460
- Approval: the board asked for both on HAL-18460 (25 Nov), via the board supervisor; Liam reviews this pull request and signs this note as the CTO
- Kind: internal
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:Psmvr/qFnfvb/j7S8QPpXynzPBTk1X3IswicWWpNEsYkqgQZn9RZ1eiLcLJdLEsfF0/KIxT+2sYgJloatbFiBg==

Review is the bottleneck, and two causes were mechanical:

1. **A rebase-only push still cost a review round.** The Merger already counts an approval of an
   older head on the current one when `git patch-id` of both diffs matches
   (`paperclip.merge-control-carry-over`), but the PR watcher handed such a pull request back to Liam
   or Julian anyway. Now, when the watcher's own comparison (the GitHub compare it already does for
   `paperclip.pr-watcher-rereview`) finds the same changes, and the approval would count on the
   current head by the HAL-14809 rules, it comments once per head on the task that the approval
   carries over, wakes nobody, and hands nothing to review (`paperclip.pr-watcher-rebase-carry`).
   It posts no approval; the GitHub token stays read-only, and the Merger's patch-id check still
   decides. Security pull requests by their paths, Liam's own pull requests, stacked pull requests
   the watcher rebased off a merged base (their approved diff from `main` holds the base's commits,
   so the patch-id differs) and any changed line still go to the reviewer.
2. **A change request waited for the author to hand the task back by hand.** A "changes requested"
   conversation comment has no commit, so it stayed the pull request's open finding after the fix
   and kept it out of the handoff for good. Now a head committed after the finding, or an author
   comment on the task after it while no monitor of theirs is due within the hour, counts as an
   answer: the task goes back, once per finding and head, to the reviewer who asked (Liam when the
   finding names him, otherwise the reviewer by the path rules) (`paperclip.pr-watcher-answered-review`).
   The snapshot keeps the reviewer a finding names and when the head was committed.

Who may approve is unchanged (HAL-14809).

## Covers

- `paperclip.merge-control-carry-over`
- `paperclip.pr-watcher-rereview`
- `paperclip.pr-watcher-handoff`
- `paperclip.pr-watcher-pushed-after-approval`
- `paperclip.github-snapshot`

## What changes

- `paperclip.merge-control-carry-over`: the plugin's Merger had no git, so its patch-ids were all
  null and an approval never carried over a rebase there. Now its facts reader compares as the PR
  watcher does: for a pull request whose signed approval names an older head, it fingerprints
  GitHub's compare of both heads from the base (`changeIdOf`, line numbers aside) and uses those as
  the patch-ids, once per head and base. A compare GitHub can't give or fails stays null, so the
  approval doesn't carry. The requirement now says so and gains an example; its existing examples
  and tests are unchanged. The live queue session's Merger already carries approvals by
  `git patch-id` (its "carried to … rebase only, identical diff" comments on 35 pull requests).
- `paperclip.pr-watcher-rereview`: a rebase-only pull request whose approval carries over no longer
  goes to review. Its first example (Liam's paths, Liam's approval) now expects the carry-over and
  no handoff. Its second example (within Julian's limits, Liam's approval) would now carry over too,
  so it becomes the case where Julian's re-approval line still applies: a rebase-only pull request on
  a `liam/` branch that Julian approved. The two tests in `src/pr-watcher/rereview.test.ts` change
  with them: "sends a rebase-only push after Liam's approval on Liam's paths back to Liam" becomes
  "records … as carried over, with no review round", and "… within Julian's limits to Julian, with
  the re-approval line" becomes "sends a rebase-only push on Liam's own pull request after Julian's
  approval to Julian, with the re-approval line".
- `paperclip.pr-watcher-handoff`: an answered finding no longer blocks the handoff, a carried-over
  approval counts as approved, and its rebase-only example now expects the carry-over (and Liam for
  Julian's approval on Liam's paths).
- `paperclip.pr-watcher-pushed-after-approval`: no warning when the approval carries over; the
  carry-over comment replaces it.
- `paperclip.github-snapshot`: the test "keeps checks, finding, approvals, labels and the queue, and
  no comment text" now also expects the finding's reviewer (`by: "Julian"`). Nothing is removed from
  what it checks.

## Why

Both rounds were pure waiting: one for a re-review whose answer the Merger already knew, the other
for an author handoff that a push or a reply already implied. The board's target is an answer within
about 30 minutes; the watcher runs every 10.
