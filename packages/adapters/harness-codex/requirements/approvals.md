# harness-codex.approvals

- Status: active
- Since: 0.1.0
- Source: HAL-194 build plan D3; HAL-3998 (Codex 0.166.0 protocol from `codex app-server generate-json-schema`, recorded session in `src/fixtures/`)

When `codex app-server` asks for a person's OK before it runs a command (`item/commandExecution/requestApproval`) or changes files (`item/fileChange/requestApproval`), the Codex harness shall report `approval.requested` with the agent whose thread asks, the tool as its `tool.called` names it (`shell` or `apply_patch`), the arguments of that call, or the request's own command and folder when the call hasn't been reported yet, and a call id: the request's approval id when it has one, and its item id otherwise. A person's decision on that call id shall go back to Codex as the answer to that request: `accept` for an OK and `decline` otherwise, so the agent goes on. A decision on a call id no request waits with, because it was decided already or Codex said it was resolved, shall be refused with an error. A request about another thread, or after the final `agent.finished`, shall give no event. No event shall contain the bridge token.

## Examples

- Given a recorded run whose rules make `touch made-up.txt` need an OK,
  when its messages are read,
  then the events are `tool.called` for `shell`, `approval.requested` for `shell` with the same command and the call id `call_1`, and then `tool.result` with outcome `error` once the command was declined.
- Given an `approval.requested` with the call id `call_1`,
  when a person rejects it,
  then Codex gets `{ "decision": "decline" }` as the answer to its request.
- Given a file change whose item started with its changes,
  when Codex asks for an OK for it,
  then `approval.requested` is for `apply_patch` with those changes.
- Given a decision on a call id no request waits with,
  when it is answered,
  then it is refused with an error.
