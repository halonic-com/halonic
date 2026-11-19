# agent-host-client.harness-settings-folder

- Status: active
- Since: unreleased
- Source: task HAL-6351 (Sign in for this agent, on the Harness page); `apps/agent-host/README.md`, "Signing an agent in"

The harness stand-in shall offer `settingsFolderOf` with a workspace and an agent's id, ask the host's `POST /v1/harnesses/settings-folder` for that agent's own settings folder for its harness, and answer the folder. It shall fail with the host's kind when the host refuses (`unknown_workspace`, `no_sign_in`, `agent_id_refused`), and with `answer_invalid` for an answer of another shape.

## Examples

- Given a host that serves the workspace,
  when Studio asks for the settings folder of the agent `writer` in Claude Code,
  then the host gets `{ workspace, agentId: "writer", harness: "claude-code" }` and the answer is the folder.
- Given a workspace the host was not told to serve,
  when Studio asks,
  then `settingsFolderOf` fails with the kind `unknown_workspace`.
