# cli.run-plugin-part-off

- Status: active
- Since: unreleased
- Source: HAL-12343 (from Nina's C54 check on HAL-12637: a run whose plugin had a local tool that couldn't start ended without a word about it)

The connectors the CLI opens for a run shall keep each connector's `newPartsOff` (`ports.connector-parts-off`) when they mark it local or not, so the engine writes a `connector.part-off` event (`engine.connector-part-off`) for a part of a plugin that can't start, next to the warning the CLI gives for it (`cli.plugin-local-tools`).

## Examples

- Given a run whose connector `notes` says its part `local:lister` is off because the sandbox can't start,
  when the CLI opens the run's connectors,
  then the opened `notes` gives `{ part: "local:lister", reason: "sandbox-unavailable" }` from `newPartsOff`.
