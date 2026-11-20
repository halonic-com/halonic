# ports.connector-parts-off

- Status: active
- Since: unreleased
- Source: HAL-12343 (a plugin's connector joins its backend and its local tools, and a run must say when one of them can't start)

The `ConnectorClient` port shall have an optional method `newPartsOff`, which gives the parts of the connector found off since its last call, each once, as `ConnectorPartOff`: the `part` (`backend`, or `local:` and a local tool's name) and a `reason` code of `events.connector-part-off`, never an error's text. An adapter without the method shall still implement `ConnectorClient`, so the port's version stays 1. `forwardedPartsOff` shall give a client that wraps a connector the connector's own `newPartsOff`, or none when it has none, so a wrapper doesn't hide a part that is off.

## Examples

- Given an adapter written before `newPartsOff`,
  when it is used as a `ConnectorClient`,
  then it compiles.
- Given a `ConnectorPartOff` whose `reason` is an error's text,
  when its type is checked,
  then it doesn't compile.
- Given a client that wraps a connector to filter its tools,
  when it spreads `forwardedPartsOff(connector)`,
  then its `newPartsOff` gives the connector's, and it has none when the connector has none.
