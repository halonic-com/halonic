# paperclip.merge-control-carry-over

- Status: active
- Since: unreleased
- Source: HAL-17703; the merge controller ADR (HAL-17700); the board, 21 Nov 06:50; MERGER.md §4 rule 3; HAL-18460 (the plugin has no git, so it compares as the PR watcher does)

When Liam's or Julian's approval names an older head and that head's changes from its base equal the current head's (`git patch-id --stable` in the Merger; in the plugin, which has no git, the fingerprint of GitHub's compare from the base, line numbers aside, as `paperclip.pr-watcher-rereview` compares), the plugin shall count the approval on the current head and comment once "Approval of <old> carried to <new>: rebase only, identical diff.".

## Examples

- Given an approval of an older head with the same patch-id as the current head,
  when a pass runs,
  then it is enqueued and the carry-over note is posted.
- Given a different patch-id,
  when a pass runs,
  then it isn't enqueued.
- Given Liam's approval of an older head, and GitHub's compares of both heads from `main` showing the same changes at other line numbers,
  when the facts are read and a pass runs,
  then it is enqueued with the carry-over note; with a changed line, or a compare GitHub fails, it isn't.
