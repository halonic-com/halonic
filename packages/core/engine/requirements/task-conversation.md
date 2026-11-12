# engine.task-conversation

- Status: active
- Since: 0.1.0
- Source: [HAL-4758](/HAL/issues/HAL-4758) (parity gap `step-signal-and-conversation-ignored`, found on [HAL-1541](/HAL/issues/HAL-1541))

When a plain `task` state with a `conversation` key finishes `done`, the engine shall record a `context.updated` for that key as the state's last event before the transition, after its output, artifact and signal. Its value shall be the turns kept under the key so far, then a `user` turn with the state's prompt and an `assistant` turn with the agent's answer: the answer's text, or its JSON for an answer that is data. A turn is an object with `role` `user` or `assistant` and a text `content`; anything else under the key counts as no turns, and so does each item of the list that isn't a turn. A state without `conversation` keeps no turns. The engine doesn't give the kept turns to the agent's next call yet.

## Examples

- Given a task state `notify` with `conversation: chat` and no `chat` in the context,
  when its agent, asked `Tell the team`, answers `Paid Acme Paper.`,
  then the engine records `context.updated` for `chat` with `[{ role: "user", content: "Tell the team" }, { role: "assistant", content: "Paid Acme Paper." }]`.
- Given the same state, with two turns already under `chat`,
  when the agent answers,
  then `chat` holds four turns, the new ones last.
- Given the same state, with the text `hello` under `chat`,
  when the agent answers,
  then `chat` holds only the two new turns.
