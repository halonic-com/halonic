# format.connector-runner-transports

- Status: active
- Since: unreleased
- Source: HAL-8089 (start local integrations and plugin backends from the run host); `settings` and `secrets`: HAL-14092

When `parseFile` reads a connector file, the format shall accept `integration: { folder: <id> }`, which names a folder under `integrations/`, and `plugin: { id: <id> }`, which names a plugin whose backend runs in the I5 runner, as transports of their own. The `integration` transport may also hold `settings`, plain string, number or boolean values the integration reads, such as the URL a `{ fromSetting }` host of its sheet reads, and `secrets`, which maps a secret name in its sheet to the name of the workspace secret it gets; neither holds a secret's value. A setting is checked for a pasted key the way a local program's `env` is: a setting that holds a known key format, or that is named like a credential (such as `token` or `apiKey`) and holds a long random part, shall fail with the error `value-looks-like-key` at that setting, and the message shall never repeat the value. A setting names no secret, so the secret-name rule doesn't apply to it, and an address such as `http://localhost:3100` passes. A connector with either transport is not local unless its own `local` key says `true` and its sheet's `hosts` name no site outside the machine (`format.connector-is-local`), because the permission sheet of such code can name such sites. The run host starts these connectors in the runner and never in the app's own process.

## Examples

- Given `transport: { integration: { folder: notes } }`, when it is parsed, then the transport is `{ integration: { folder: "notes" } }`.
- Given `transport: { plugin: { id: acme-tracker } }`, when it is parsed, then the transport is `{ plugin: { id: "acme-tracker" } }`.
- Given an integration connector without `local`, when it is checked for `privacy.localOnly`, then it is not local.
- Given a plugin connector with `local: true` and no sheet hosts, when it is checked, then it is local.
- Given `transport: { integration: { folder: issues, settings: { url: "http://localhost:3100" }, secrets: { paperclip-key: agent-key } } }`, when it is parsed, then the transport keeps both maps as written.
- Given a setting `endpoint` whose value is a pasted GitHub token, when it is parsed, then it fails once with `value-looks-like-key` at `transport.integration.settings.endpoint` and the message doesn't repeat it.
- Given a setting `apiKey` whose value is 32 random letters and digits, when it is parsed, then it fails with `value-looks-like-key`; under the name `label` the same value passes.
- Given the settings `url: http://localhost:3100` and `label: work notes`, when they are parsed, then they pass: a setting isn't held to the secret-name rule.
- Given a setting whose value is a map, when it is parsed, then it fails.
- Given both `integration` and `stdio`, when it is parsed, then it fails with `invalid_union` at `transport`.
