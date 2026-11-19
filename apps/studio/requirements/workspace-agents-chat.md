# studio.workspace-agents-chat

- Status: active
- Since: 0.1.0
- Source: HAL-13177 (T6 Try it chat); flow-agents 3.3 and 4.4 (Try it uses what's saved; not a run in v0.1, HAL-902); HAL-11705

When the Agents feature asks the desktop app to answer a Try it message, the app shall answer it with the engine's chat service, outside any run, naming the agent by its hub and id so the engine uses the agent as it's saved with its own tools, adding no tools of its own, and stopping after the agent's model call limit of turns, or 64 when the limit is higher. It shall pass the person's Stop signal and the listener on. Each answer counts as a start (`studio.untrusted-starts-nothing`): before it asks the model, the app shall check that the workspace may start, every time, so trust removed while the engine is open rejects the next answer with `denied` "This workspace isn't trusted yet, so nothing was started." and no model turn runs. Where there is no engine, it shall reject with `unavailable` "The engine isn't answering.", and for an agent it doesn't have, with `not_found`.

## Examples

- Given the agent `writer` with the limit 6,
  when the feature asks for an answer,
  then the engine's chat service gets the hub `acme`, the agent `writer`, no tools and 6 turns.
- Given the agent `writer` with the limit 200,
  when the feature asks for an answer,
  then the chat service gets 64 turns.
- Given no engine,
  when the feature asks for an answer,
  then it rejects with "The engine isn't answering."
- Given the engine is open on a trusted workspace,
  when the person removes the trust and sends a Try it message,
  then it rejects with `denied` and the model isn't asked.
