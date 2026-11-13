# workspace.declared-tools

- Status: active
- Since: 0.1.0
- Source: HAL-8257, Liam's decision of 13 Nov (HAL-8255); the engine's side is `engine.turn-declared-tools`

When a run starts with the local integrations a trust check covered, the workspace package shall give the run's definitions the tools that the sheet bound to each of the hub's connectors declares, by connector id and then by tool name, each with its `risk` and the `noun` and `verb` it has. A connector is bound to the sheet of the integration in `integrations/<folder>` when its transport is `integration: { folder }`. A connector with another transport, or whose folder holds no integration, shall have no entry. A run started with no integrations shall have no `declaredTools`. The CLI shall pass the integrations only with a trust grant, so a workspace nobody trusted gives no tool a noun.

## Examples

- Given a connector `mail` with `transport: { integration: { folder: mail } }` and the integration in `integrations/mail` that declares `send_email` as `send` with a `noun`, when a run's definitions are built with it, then `declaredTools` is `{ mail: { send_email: { risk: "send", noun } } }`.
- Given a connector with an `http` transport, when a run's definitions are built, then `declaredTools` has no entry for it.
- Given a run's definitions built with no integrations passed, then they have no `declaredTools`.
- Given a run started with no trust grant, when the CLI builds the integrations it passes, then there are none.
