# app.run-proposal-end

- Status: active
- Since: 0.1.0
- Source: save model 7; engine answer 2 on HAL-3267 ("when the run ends", "what the engine reports"); flow-inbox CHECK C10; HAL-3248

When a run with a worktree ends, done, failed or cancelled, and it changed files there, the proposal service shall commit the worktree onto `refs/halonic/proposals/<runId>` with the run's version commit as the only parent, record the proposal with every file undecided, remove the worktree, and give back the proposal: the run, its base, its ref, each changed file with how it changed and its digest at the base (`absent` for a new file), and the items those files belong to. When the run changed nothing, or only files the repository ignores, the proposal service shall remove the worktree and leave no ref and no record.

## Examples

- Given run `01JD8Q` started at `a1b2c3`, changed `agents/clerk.agent.yaml` and added `notes/today.md`,
  when it ends,
  then `refs/halonic/proposals/01JD8Q` has parent `a1b2c3`, the worktree is gone, and the proposal lists `agents/clerk.agent.yaml` as modified with its digest at `a1b2c3` and `notes/today.md` as added with base `absent`, for item `clerk`.
- Given run `01JD8Q` deleted `agents/old.agent.yaml`,
  when it ends,
  then the proposal lists it as deleted with its digest at the base.
- Given run `7KQ2MX` changed nothing,
  when it ends,
  then there is no ref and no record, and its worktree is gone.
- Given run `7KQ2MX` only wrote a file the repository ignores,
  when it ends,
  then there is no ref and no record.
