# engine.llm-event-address

- Status: active
- Since: unreleased
- Source: HAL-13404 (first-run progress, HAL-7986 section 7: the waiting line says "Waiting for llama3.2 on this computer" or "Waiting for Anthropic", not "Waiting for the model")

The run log's `llm.request` event shall carry an optional `address`: the `host:port` the provider calls, such as `localhost:11434`, written only when the provider is on this computer (its address is `localhost`, in `127.0.0.0/8` or `::1`, the rule of the cost checks). Run logs get copied and shared, so it holds the host and port only, never the scheme, path, query or user name. The test model, which calls no address, and any other provider have none. An agent on a harness has none either: its line names the harness, as `harness.started` does.

The `llm.fallback` event shall name the model the call moved to as `llm.request` does: an optional `provider`, `model`, `alias` and `address`, so a reader stops naming the model that failed. `to` keeps its meaning.

Every new field is optional, so a reader of an older log, where they are absent, shows the line without them. The readable name of a provider, such as "Ollama", is not in the event: a reader takes it from the provider file by `provider`.

The event types are in `@halonicjs/events`; the workspace's model resolver works out the address and the engine writes the fields.

## Examples

- Given an Ollama provider file with no `baseUrl`,
  when the engine logs a call to its model,
  then the `llm.request` event has `address: "localhost:11434"`.
- Given a provider with `baseUrl: http://user@127.0.0.1:8080/v1`,
  when the engine logs a call to it,
  then the event has `address: "127.0.0.1:8080"`, without the user name or path.
- Given an Anthropic provider, or one at `http://192.168.1.20:11434/v1`,
  when the engine logs a call to it,
  then the event has no `address`.
- Given a call on the alias `smart` that moves on to the alias `default`, an Ollama model on this computer,
  when the engine logs the move,
  then the `llm.fallback` event has `to: "default"`, the provider's id as `provider`, the model as `model`, `alias: "default"` and `address: "localhost:11434"`.
