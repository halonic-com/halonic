# format.connector-runner-transports

- Status: active
- Since: 0.1.0
- Source: HAL-8089 (start local integrations and plugin backends from the run host)

When `parseFile` reads a connector file, the format shall accept `integration: { folder: <id> }`, which names a folder under `integrations/`, and `plugin: { id: <id> }`, which names a plugin whose backend runs in the I5 runner, as transports of their own. A connector with either transport is not local unless its own `local` key says `true`, because the permission sheet of such code can name sites outside the machine. The run host starts these connectors in the runner and never in the app's own process.

## Examples

- Given `transport: { integration: { folder: notes } }`, when it is parsed, then the transport is `{ integration: { folder: "notes" } }`.
- Given `transport: { plugin: { id: acme-tracker } }`, when it is parsed, then the transport is `{ plugin: { id: "acme-tracker" } }`.
- Given an integration connector without `local`, when it is checked for `privacy.localOnly`, then it is not local.
- Given a plugin connector with `local: true`, when it is checked, then it is local.
- Given both `integration` and `stdio`, when it is parsed, then it fails with `invalid_union` at `transport`.
