# agent-host.program-copy-routes

- Status: active
- Since: unreleased
- Source: HAL-16260 (Studio's window starts a live run's programs in a copy at its commit); HAL-16774; `app.runs-read-latest-version`

When Studio asks to open a program copy of a workspace the launcher named at a commit, the agent host shall make a git worktree of the workspace at that commit, through the same hardened git as the CLI, in its own folder in Halonic's data folder, apart from the CLI's program copies, and answer the copy's real path. It shall take from the caller only the workspace, a commit that is a full hex object id (40 or 64 characters) and, to release one, the copy's path. If the workspace isn't one the launcher named, then the agent host shall answer 404 `unknown_workspace` and make nothing. If the copy can't be made, then the agent host shall answer 422 `program_copy_refused` with the reason, and shall never answer the saved folder in its place. When Studio starts a workspace's copies, the agent host shall first stop every connector of that workspace, then remove the copies it holds for it and the copies a stopped host left. When Studio releases a copy, the agent host shall remove it only when it holds that path, compared as a real path, for that workspace; any other path shall be answered 404 and nothing shall be removed. When the host stops, it shall remove its copies after the connectors and sessions are closed, and then stop their git. Every route shall need the host's launch token, as the other host routes do.

## Examples

- Given a workspace whose committed script was saved again with a change, and a `.env` that git doesn't hold,
  when Studio opens a copy at the commit,
  then the copy holds the committed script and no `.env`.
- Given a folder the launcher did not name,
  when Studio starts, opens or releases a copy for it,
  then the answer is 404 `unknown_workspace` and nothing is made.
- Given a commit the workspace doesn't have,
  when Studio opens a copy at it,
  then the answer is 422 `program_copy_refused`.
- Given a commit that isn't a full hex object id, such as a branch name or a git option,
  when Studio opens a copy at it,
  then the answer is 400.
- Given an open copy,
  when Studio releases it,
  then the copy is gone.
- Given a copy a stopped host left,
  when Studio starts the workspace's copies,
  then the copy is gone.
- Given a connector running in a copy,
  when Studio starts the workspace's copies,
  then the connector is closed before the copy is removed.
- Given a path the host doesn't hold for the workspace,
  when Studio releases it,
  then the answer is 404 and nothing is removed.
- Given a `post-checkout` hook in the workspace's repository,
  when the host makes a copy,
  then the hook doesn't run.
- Given a host with a connector running in a copy,
  when the host stops,
  then the connector is closed before the copies are removed.
- Given a request without the launch token,
  then the answer is 401.
