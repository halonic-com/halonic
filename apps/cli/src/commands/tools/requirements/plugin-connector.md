# cli.commands.tools.plugin-connector

- Status: active
- Since: unreleased
- Source: HAL-12638 (Nina's C54 docs check on HAL-12634, item P18); HAL-13716 (a plugin that isn't added)

When `halonic tools review <source>` or `halonic tools approve <source>` names a plugin's connector, the command shall start nothing, say that its tools need no approval because trusting the plugin covers them, show no report link and exit 0. When no plugin with the connector's id is added to the profile, a second line shall say so and name `halonic plugin add`, and the command shall still exit 0. With `--json` it shall give `needsNoApproval: "plugin"` with `ok: true`, not an error. A connector whose tools are built into Halonic shall get `needsNoApproval: "built_in"` the same way.

## Examples

- Given Acme's connector `lf` with `transport: { plugin: { id: files } }` and the plugin `files` added,
  when `halonic tools review lf` runs,
  then it prints "lf is a plugin's connector. Its tools need no approval: trusting the plugin covers them." and exits 0.
- Given the same,
  when `halonic tools approve lf --all --json` runs,
  then the document has `ok: true`, no tools approved and `needsNoApproval: "plugin"`.
- Given the same connector and no plugin `files` added,
  when `halonic tools review lf` runs,
  then it prints the same line, then "The plugin files isn't added, so it has no tools yet. Add it with halonic plugin add <folder or git address>.", and exits 0.
