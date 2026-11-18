# agent-host-client.proposal-folders

- Status: active
- Since: unreleased
- Source: HAL-10849 (Studio runs harness agents, HAL-11378); `agent-host.proposal-routes`

The proposal folders stand-in shall open, look up and end a run's folder by asking the host's `POST /v1/proposals/open`, `folder-of` and `end`, and clear a stopped engine's leftovers with `start`, and give the engine the folder the host answered. It shall send only the workspace it was made for and the run's ids and version. It shall fail with the host's kind and reason when the host refuses to open a folder, and when the answer isn't a folder. Ending a folder shall never throw.

## Examples

- Given a host that opens the folder,
  when the engine opens the folder of `run_1`,
  then the host gets the workspace and the run's ids and version, and the engine gets the host's folder.
- Given a host that refuses with `proposal_refused`,
  when the engine opens a folder,
  then the call fails with that kind and the host's reason.
- Given a host that is down,
  when the engine ends a folder,
  then the call returns and doesn't throw.
- Given a run with no open folder,
  when the engine asks for its folder,
  then the answer is `null`.
