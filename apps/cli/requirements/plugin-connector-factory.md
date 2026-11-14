# cli.plugin-connector-factory

- Status: active
- Since: 0.1.0
- Source: HAL-8089 (start local integrations and plugin backends from the run host); the connector transports are `format.connector-runner-transports`

When a run's hub names a connector with the `plugin` transport, the `halonic` command shall serve it through the connector factories like any other connector, and shall start the plugin's backend runner at the first call that needs the connector, never when the run only holds it. When the start is refused, such as for a plugin that isn't trusted or changed since it was trusted, the call that needed the connector shall fail with a sentence that names the connector's id and the reason, and no runner shall have started; the next call checks again. When the run ends, the runner shall stop, also when no tool was called.

## Examples

- Given a run that holds a plugin connector and calls none of its tools, when the run ends, then no runner started.
- Given a run that calls the tool of a plugin connector, when the call is made, then it goes through the runner and returns its answer.
- Given a plugin that isn't trusted, when a run calls its tool, then the call fails with `Connector "weather" didn't start: …` and the reason, and no runner started.
