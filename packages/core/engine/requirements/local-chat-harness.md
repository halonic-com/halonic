# engine.local-chat-harness

- Status: active
- Since: 0.1.0
- Source: HAL-189, 4f as amended after Liam's decision on HAL-3789

When the local executor runs a chat turn that names an agent, and the host gave it `chatAgentOf`, it shall read the agent's file as the workspace has it now. When that file names a harness program, the executor shall run the turn in that harness (`engine.chat-harness-turn`) with the harness ports, scheduler and ids of its `runs`, and call no model; otherwise it shall run the turn in Halonic's own loop (`engine.local-chat-turn`). When the file names a harness program and the executor has no harnesses, the turn shall reject rather than run in Halonic's own loop. A start limit's timer of a chat turn shall reach the turn through the executor's `onTimer`, and closing the executor shall stop the chat turns' harness calls too.

## Examples

- Given an executor with harnesses and agent `writer`, whose file names `claude-code`,
  when a chat with `writer` sends a message,
  then the turn runs in Claude Code, no model is called and no run log is written.
- Given that executor and agent `clerk`, whose file names no harness,
  when a chat with `clerk` sends a message,
  then the turn runs on `clerk`'s model.
- Given an executor without harnesses,
  when a chat with `writer` sends a message,
  then the turn rejects and no model is called.
- Given a chat turn with `writer` whose sandbox is slow to open,
  when the sandbox start limit's timer reaches the executor's `onTimer`,
  then the turn rejects with `sandbox-start-failed`, and everything it started has stopped.
