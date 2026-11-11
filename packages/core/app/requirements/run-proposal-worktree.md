# app.run-proposal-worktree

- Status: active
- Since: 0.1.0
- Source: save model 7; engine answer 2 on HAL-3267 ("where"); HAL-3047; HAL-3248; HAL-4791 (a run waiting across a restart); HAL-5218

When a top-level run that can write workspace files starts, the proposal service shall add one worktree for it at the run's version commit, in the folder the version control adapter keeps worktrees in (Halonic's data folder, never inside the workspace folder), record it, and give its folder to the harness as the place the run writes workspace files. While the run is open, also after a restart, the proposal service shall give the same folder again when asked for it, also when asked to open it again, and add no second worktree. It shall refuse to open a run that already has a proposal. When Halonic starts, the proposal service shall keep the worktrees of runs the engine hasn't ended, remove the worktree, record and any proposal ref of every other run that never finished its end, remove every worktree no record holds, and leave the proposals of runs that ended alone.

## Examples

- Given run `01JD8Q` starts at version `a1b2c3`,
  when the proposal service opens its worktree,
  then the folder holds the files of `a1b2c3`, not the saved files.
- Given run `01JD8Q` already has a worktree,
  when the proposal service is asked to open another for it,
  then it gives the same folder and adds none.
- Given run `01JD8Q` ended with a proposal,
  when the proposal service is asked to open a worktree for it,
  then it refuses and adds none.
- Given run `01JD8Q` has a worktree and waits for a person,
  when Halonic restarts and the engine asks for the run's folder,
  then it gets the same folder, with what the run wrote there.
- Given Halonic closed while run `01JD8Q` was running, the engine has ended it, and run `7KQ2MX` had ended with a proposal,
  when Halonic starts,
  then `01JD8Q`'s worktree and record are gone and `7KQ2MX`'s proposal is still there.
