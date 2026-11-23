# agent-host-client.program-copies

- Status: active
- Since: unreleased
- Source: HAL-16260 (Studio's window starts a live run's programs in a copy at its commit); `agent-host.program-copy-routes`

The program copies stand-in shall open a copy of the workspace at a commit by asking the host's `POST /v1/program-copies/open`, release it with `release`, and stop the workspace's connectors and sweep its copies with `start`. It shall send only the workspace it was made for, the commit and, to release one, the copy's path, and give the engine the path the host answered. When the host refuses to make the copy, can't be reached or answers without a path, opening shall fail with `ProgramCopyUnavailableError`, which keeps the host's error as its cause, and shall never give the workspace folder in its place. Releasing a copy shall never throw: an error goes to `reportError`, and a second release of the same copy asks the host nothing.

## Examples

- Given a host that makes the copy,
  when the engine opens the copy at a commit,
  then the host gets the workspace and the commit, and the engine gets the host's path.
- Given a host that refuses with `program_copy_refused`,
  when the engine opens a copy,
  then the call fails with `ProgramCopyUnavailableError`, and its cause has that kind and the host's reason.
- Given an open copy and a host that is down,
  when the engine releases the copy twice,
  then the call returns, the error goes to `reportError`, and the host is asked once.
- Given a host that sweeps the copies,
  when the engine starts them,
  then the host gets the workspace.
