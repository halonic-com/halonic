# Decision: show the watch's file limit once as a toast

- Approval: https://paperclip.halonic.com/HAL/issues/HAL-12964
- Kind: user-visible

Since #3547 the shell stops watching a workspace with more than 50,000 files and sends one
failure with a sentence that says why, but Studio never showed it. The team decided on HAL-12964
(an error state of an approved screen, HAL-2282) to show that sentence once per workspace, as a
warning toast with no button that stays until it's closed. Other watch failures stay as they are.

`files.follow-host` gains one sentence and one example for this toast. Nothing in the requirement
is removed or weakened, and no test is dropped.

## Covers

- files.follow-host
