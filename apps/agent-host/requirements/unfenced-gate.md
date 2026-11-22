# agent-host.unfenced-gate

- Status: active
- Since: unreleased
- Source: HAL-13195 (Studio's agent host gets an unfenced session; Liam planned it after HAL-13090)

When the agent host is asked to open a session without the sandbox for an agent, it shall first check, on its own records and never on the page's word, that a person let that agent out, and refuse otherwise, in this order:

1. a folder the launcher didn't name, compared by real path (`404 unknown_workspace`), or an agent that workspace hasn't (`404 unknown_agent`). The host loads the workspace and reads the agent's file from disk itself;
2. an agent that the person's trust record for the workspace doesn't list exactly as its file is now, by its harness, sites, working folder and `asks` (`403 workspace_not_trusted`). It shall fail closed: a trust record it can't read, a host with no profile folder (so no trust record at all), and an agent in Halonic's own loop, which starts no program, each get this refusal, even when a record names that agent;
3. an agent whose file, as it is now byte for byte, has no "On this computer" choice in the person's profile, read with the same `AgentPlacement` as the CLI (`403 not_on_this_computer`);
4. a profile the host didn't build for that agent in that workspace, one a session already opened with, or one that differs from the built one in any field but its environment (`403 profile_not_built`). The run's start checks the environment (`agent-host.unfenced-start`).

The session passes no workspace connector or integration program to the run. The request names none, and a profile that carries anything the host didn't build, a connector's program included, gets `profile_not_built`. The only program a run in the session starts is the harness the host's own adapter starts, with the bridge's MCP servers alone and the agent's own settings alone, so the working folder's MCP servers (`.mcp.json`, `.codex/config.toml`) and hooks don't load (`harness-claude-code.command`, `harness-codex.config`). A workspace `stdio` connector starts only through the host's connector routes, in its own sandbox session and after its own check against the same trust record (`agent-host.connector-routes`), and the run reaches it only as a tool on its bridge, each call checked there.

The host's profile builder shall keep each profile it builds, with the workspace and the agent it is for, only until a session opens with it. A caller shall be able to ask, right before it opens, whether the profile still waits, so that of two requests with one profile only the first opens.

## Examples

- Given the coder, trusted and set to "On this computer", and a profile the host built for it,
  when the gate checks a request for it,
  then it passes with the built profile.
- Given the coder set to "On this computer" but missing from the trust record,
  when the gate checks a request for it,
  then it refuses with `workspace_not_trusted`.
- Given the coder trusted but never set to "On this computer", or its file changed since the choice, even by whitespace,
  when the gate checks a request for it,
  then it refuses with `not_on_this_computer`.
- Given a profile the host didn't build, built for another agent, changed outside its environment, or already opened,
  when the gate checks a request with it,
  then it refuses with `profile_not_built`.
- Given the coder set to "On this computer" and a trust record the host can't read, or a host with no profile folder,
  when the gate checks a request for it,
  then it refuses with `workspace_not_trusted`.
- Given an agent in Halonic's own loop set to "On this computer", whose name a trust record lists,
  when the gate checks a request for it,
  then it refuses with `workspace_not_trusted`.
- Given a profile the host built for the coder, with a connector's program added to it,
  when the gate checks a request with it,
  then it refuses with `profile_not_built`, and no connector reaches the run.
- Given a folder the launcher didn't name, or an agent the workspace hasn't,
  when the gate checks a request for it,
  then it refuses with `unknown_workspace` or `unknown_agent`.
