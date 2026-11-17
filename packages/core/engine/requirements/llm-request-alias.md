# engine.llm-request-alias

- Status: active
- Since: unreleased
- Source: HAL-1308 (the Failed banner for a model that can't use tools names the model alias it came from, "used by the model alias `fast`")

The run log's `llm.request` event shall carry an optional `alias`, the name of the model alias the call went to, such as `fast`. The engine writes it when the model has an alias and leaves it out otherwise. It holds a name, never a key. A reader that doesn't find it (an older log) shows the banner without the alias.

The event's type is in `@halonicjs/events`; the engine writes the field.

## Examples

- Given a call to the alias `fast`,
  when the engine logs the request,
  then the `llm.request` event has `alias: "fast"`.
- Given a call to a model that has no alias,
  when the engine logs the request,
  then the event has no `alias`.
