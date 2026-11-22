# agent-host.this-computer-sessions

- Status: active
- Since: unreleased
- Source: HAL-13195 (follow-up from HAL-13194; Liam planned it after HAL-13090)

The agent host shall open a session without the sandbox only for an agent a person set to "On this computer", and only after checking, on its own records and never on the page's word, everything that decides it. `GET /v1/sandbox/this-computer` shall answer `{ offered }`: `true` only when the host has a profile folder and doesn't run on Windows, so Studio can tell whether it may start such an agent. `POST /v1/sandbox/this-computer/open` with `{ workspace, hubId, agentId, profile }` shall answer `403 not_offered` where it offers none. Otherwise, before anything starts, it shall refuse, in this order:

1. a folder the launcher didn't name, compared by real path (`404 unknown_workspace`), or an agent the workspace hasn't (`404 unknown_agent`); the host loads the workspace and the agent's file from disk itself;
2. an agent the person's trust record for the workspace doesn't list exactly as its file is now: harness, sites, working folder and `asks` (`403 workspace_not_trusted`);
3. an agent whose file, as it is now byte for byte, has no "On this computer" choice in the person's profile, read with the same `AgentPlacement` as the CLI (`403 not_on_this_computer`);
4. a profile the host didn't build for that agent in that workspace, one a session already opened with, or one that differs from the built one in any field but its environment (`403 profile_not_built`). Of two requests with one profile, only the first opens.

Once all of these pass, it shall open the session with the launcher the CLI uses (`createHostSandbox()`, HAL-13090), answer `{ session, fence }` with the fence `off`, and keep the profile it built with the session until the session closes. `POST /v1/harnesses/runs/start` shall then refuse, with `403 environment_not_host` and before the harness starts or the bridge binds, a run in a session without a fence that the host didn't open this way, or one whose environment isn't exactly the built profile's variables plus the variables the run's harness adds for the run's bridge and task. So no variable the page picks reaches a program that runs with all the person's rights. A fenced session's runs are not checked here.

## Examples

- Given the coder, trusted and set to "On this computer", and a profile the host built for it,
  when Studio opens a session for it,
  then the host opens it with the launcher and answers its id with the fence `off`.
- Given the coder set to "On this computer" but missing from the trust record,
  when Studio opens a session for it,
  then the host answers `403 workspace_not_trusted` and starts nothing.
- Given the coder trusted but set to run in the sandbox, or its file changed since the choice, even by whitespace,
  when Studio opens a session for it,
  then the host answers `403 not_on_this_computer`.
- Given a profile the host didn't build, or one already opened,
  when Studio opens a session with it,
  then the host answers `403 profile_not_built`.
- Given a session the host opened for the coder,
  when Studio starts a run in it whose environment adds `NODE_OPTIONS`,
  then the host answers `403 environment_not_host` and the harness never starts.
- Given a host without a profile folder,
  when Studio asks whether it offers sessions on this computer,
  then the host answers `{ "offered": false }`.
