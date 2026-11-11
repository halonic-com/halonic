# app.run-proposal-worktree

- Status: active
- Since: 0.1.0
- Source: save model 7; engine answer 2 on HAL-3267 ("where"); HAL-3047; HAL-3248

When a top-level run that can write workspace files starts, the proposal service shall add one worktree for it at the run's version commit, in the folder the version control adapter keeps worktrees in (Halonic's data folder, never inside the workspace folder), record it, and give its folder to the harness as the place the run writes workspace files. When Halonic starts, the proposal service shall remove every worktree left from runs that were running when it closed, with their records and any proposal ref they made, and leave the proposals of runs that ended alone.

## Examples

- Given run `01JD8Q` starts at version `a1b2c3`,
  when the proposal service opens its worktree,
  then the folder holds the files of `a1b2c3`, not the saved files.
- Given run `01JD8Q` already has a worktree,
  when the proposal service is asked to open another for it,
  then it refuses and adds none.
- Given Halonic closed while run `01JD8Q` was running, and run `7KQ2MX` had ended with a proposal,
  when Halonic starts,
  then `01JD8Q`'s worktree and record are gone and `7KQ2MX`'s proposal is still there.
