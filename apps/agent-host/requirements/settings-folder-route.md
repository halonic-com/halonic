# agent-host.settings-folder-route

- Status: active
- Since: unreleased
- Source: HAL-6351 (Sign in for this agent, on the Harness page); HAL-5395; HAL-6169

When Studio asks for an agent's own settings folder for a harness, the agent host shall answer the folder a run of that agent uses, `harness-settings/<agentId>/<harnessId>` in the workspace's folder of Halonic's profile, and shall make it, only the user's, before it answers. It shall take from the caller only the workspace, the agent's id and the harness. It shall answer 404 `unknown_workspace` for a folder the launcher did not name, and make nothing for it; 404 `unknown_harness` for a harness it does not have; 422 `no_sign_in` for a harness without a sign-in of its own; and 422 `agent_id_refused` for an id that can't name a folder safely.

## Examples

- Given a named workspace,
  when Studio asks for the settings folder of the agent `writer` in Claude Code,
  then the answer is the same folder a run of `writer` uses, and it exists.
- Given a folder the launcher did not name,
  when Studio asks,
  then the answer is 404 `unknown_workspace` and nothing is made.
- Given the agent id `../writer`,
  when Studio asks,
  then the answer is 422 `agent_id_refused`.
- Given a harness without a sign-in of its own,
  when Studio asks,
  then the answer is 422 `no_sign_in`.
