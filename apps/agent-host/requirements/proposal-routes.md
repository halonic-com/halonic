# agent-host.proposal-routes

- Status: active
- Since: unreleased
- Source: HAL-10849 (Studio runs harness agents, HAL-11378); `engine.run-proposal-folder`

When Studio asks to open, find or end a run's proposal folder, or to clear the leftovers of a stopped engine, the agent host shall do it with the run proposal service for a workspace the launcher named, and answer the folder's path. It shall take from the caller only the workspace and the run's ids and version, and shall keep worktrees, copies and records in Halonic's data folder, never in the workspace. It shall answer 404 `unknown_workspace` for a workspace the launcher did not name, and make nothing for it, and 422 `proposal_refused` with the reason when a folder can't be made. It shall start git only when a run first needs a worktree. When the host stops, it shall stop the git it started, after the runs and their sessions.

## Examples

- Given a named workspace and a run that reads the saved files,
  when Studio opens its folder,
  then the answer is a folder in Halonic's data folder holding a copy of the files, and finding it gives the same folder.
- Given an open folder,
  when Studio ends the run,
  then the folder is gone and finding it answers `null`.
- Given a folder the launcher did not name,
  when Studio opens a folder for it,
  then the answer is 404 `unknown_workspace` and nothing is made.
- Given a workspace with nothing kept from earlier runs,
  when Studio asks to clear leftovers,
  then the answer is `{}` and git isn't started.
- Given a workspace whose run opened a folder,
  when the host stops,
  then its git is stopped, and stopping again does nothing.
- Given a body with a field the route does not know,
  then the answer is 400.
