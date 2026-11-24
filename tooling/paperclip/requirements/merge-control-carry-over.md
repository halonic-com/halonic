# paperclip.merge-control-carry-over

- Status: active
- Since: unreleased
- Source: HAL-17703; the merge controller ADR (HAL-17700); the board, 21 Nov 06:50; MERGER.md §4 rule 3

When Liam's or Julian's approval names an older head and `git patch-id --stable` of that head's diff from `main` equals the current head's, the plugin shall count the approval on the current head and comment once "Approval of <old> carried to <new>: rebase only, identical diff.".

## Examples

- Given an approval of an older head with the same patch-id as the current head,
  when a pass runs,
  then it is enqueued and the carry-over note is posted.
- Given a different patch-id,
  when a pass runs,
  then it isn't enqueued.
