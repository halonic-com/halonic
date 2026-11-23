# agent-host.this-computer-sessions

- Status: active
- Since: unreleased
- Source: HAL-13195 (follow-up from HAL-13194; Liam planned it after HAL-13090)

The agent host shall open a session without the sandbox only through `POST /v1/sandbox/this-computer/open`, and only once its own gate passes (`agent-host.unfenced-gate`). `GET /v1/sandbox/this-computer` shall answer `{ offered }`: `true` only when the host has a profile folder and doesn't run on Windows, so Studio can tell whether it may start an agent set to "On this computer". `POST /v1/sandbox/this-computer/open` with `{ workspace, hubId, agentId, profile }` shall answer `403 not_offered` where the host offers none, `503 host_stopping` and `429 too_many_sessions` as the sandbox's own route does, and the gate's refusal when it refuses, and shall start nothing in any of these cases.

Once the gate passes, the host shall take the built profile, so that of two requests with one profile only the first opens and the other gets `403 profile_not_built`. It shall open the session with the launcher the CLI uses (`createHostSandbox()`, HAL-13090), behind the profile builder so the session removes its temp folder when it closes, and answer `{ session, fence }` with the fence `off`. Before the answer goes out, it shall keep what the gate let out for the session (the built profile, the agent and the instructions folder), so a run's start in it is held to that (`agent-host.unfenced-start`).

## Examples

- Given the coder, trusted and set to "On this computer", and a profile the host built for it,
  when Studio opens a session for it,
  then the host opens it with the launcher and answers its id with the fence `off`.
- Given the same request a second time,
  when Studio opens a session with it,
  then the host answers `403 profile_not_built` and opens nothing.
- Given the coder set to "On this computer" but missing from the trust record,
  when Studio opens a session for it,
  then the host answers the gate's `403 workspace_not_trusted` and starts nothing.
- Given a session the host opened for the coder,
  when Studio starts a run in it whose environment adds `NODE_OPTIONS`,
  then the host answers `403 environment_not_host` and the harness never starts.
- Given a host without a profile folder, or on Windows,
  when Studio asks whether it offers sessions on this computer,
  then the host answers `{ "offered": false }`, and an open is `403 not_offered`.
