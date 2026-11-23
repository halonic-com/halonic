# engine.local-chat-turn

- Status: active
- Since: 0.1.0
- Source: HAL-1061, rules agreed on HAL-1516

When the local executor runs a chat turn, it shall pick the provider and model with the `resolveModel` function it was given, passing the whole request so the alias reaches it, and run one model turn with the request's messages, tools and parameters, the Halonic tools and connected servers it was given (only the servers the agent's file lists under `connectors` when the request names an agent that `chatAgentOf` finds a file for), and its round limit (20 unless set). It shall return the turn's answer, messages and refusals with the model name, and keep no run log. When the request's `signal` aborts, it shall abort the model call going on, try no other model, and reject with the signal's reason. Until the run kernel is built into it, `start`, `startAgent` and `send` shall reject and `subscribe` shall close the listener with an error, without throwing.

## Examples

- Given an executor with a Halonic tool `lookup`, and a request with alias `fast`,
  when the model calls `lookup` and then answers "Found it",
  then `resolveModel` gets the request with alias `fast`, and the turn ends with "Found it", both answers and the tool message in `turn`, and the model name.
- Given an executor with servers `mail` and `tracker`, and a `clerk` agent whose file lists `mail`,
  when a chat turn names `clerk`, and another names no agent,
  then the first is offered only `mail`'s tools, and the second both servers' tools.
- Given a chat turn whose model call is waiting on a provider that has a fallback model,
  when the person stops the chat,
  then the provider's request is aborted, the fallback model isn't called, and the turn rejects.
- Given an executor built with a round limit of 0,
  when it is created,
  then it throws a `RangeError`.
