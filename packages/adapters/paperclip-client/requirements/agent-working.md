# paperclip-client.agent-working

- Status: active
- Since: unreleased
- Source: the board's Messenger request "I don't see you typing" (HAL-18736); plan approved by the maintainer on HAL-18736

When the Paperclip provider lists a chat, it shall set `agentWorking` to whether Paperclip's live runs (`GET /api/companies/:company/live-runs`) hold a running, started run of the chat's own agent on the chat's task. A queued run, or a run of another agent on the same task, shall not count. When Paperclip doesn't answer that read, the chat shall carry no `agentWorking`. A change of `agentWorking` shall be a change that `changes` reports. No run's logs, errors or wake text shall be kept.

## Examples

- Given a running run of the chat's agent on the chat's task,
  when the chats are listed,
  then the chat's `agentWorking` is true.
- Given only another agent's running run, or the chat agent's queued run, on that task,
  when the chats are listed,
  then the chat's `agentWorking` is false.
- Given the agent's run starts and then ends between two polls,
  when the provider polls,
  then each poll reports the source as changed.
