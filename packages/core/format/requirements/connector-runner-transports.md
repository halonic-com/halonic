# format.connector-runner-transports

- Status: active
- Since: unreleased
- Source: HAL-8089 (start local integrations and plugin backends from the run host); `settings` and `secrets`: HAL-14092

When `parseFile` reads a connector file, the format shall accept `integration: { folder: <id> }`, which names a folder under `integrations/`, and `plugin: { id: <id> }`, which names a plugin whose backend runs in the I5 runner, as transports of their own. The `integration` transport may also hold `settings`, plain string, number or boolean values the integration reads, such as the URL a `{ fromSetting }` host of its sheet reads, and `secrets`, which maps a secret name in its sheet to the name of the workspace secret it gets; neither holds a secret's value. A connector with either transport is not local unless its own `local` key says `true`, because the permission sheet of such code can name sites outside the machine. The run host starts these connectors in the runner and never in the app's own process.

## Examples

- Given `transport: { integration: { folder: notes } }`, when it is parsed, then the transport is `{ integration: { folder: "notes" } }`.
- Given `transport: { plugin: { id: acme-tracker } }`, when it is parsed, then the transport is `{ plugin: { id: "acme-tracker" } }`.
- Given an integration connector without `local`, when it is checked for `privacy.localOnly`, then it is not local.
- Given a plugin connector with `local: true`, when it is checked, then it is local.
- Given `transport: { integration: { folder: issues, settings: { url: "http://localhost:3100" }, secrets: { paperclip-key: agent-key } } }`, when it is parsed, then the transport keeps both maps as written.
- Given a setting whose value is a map, when it is parsed, then it fails.
- Given both `integration` and `stdio`, when it is parsed, then it fails with `invalid_union` at `transport`.
