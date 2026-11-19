# cli.commands.tools.plugin-connector

- Status: active
- Since: unreleased
- Source: HAL-12638 (Nina's C54 docs check on HAL-12634, item P18)

When `halonic tools review <source>` or `halonic tools approve <source>` names a plugin's connector, the command shall start nothing, say that its tools need no approval because trusting the plugin covers them, show no report link and exit 0. With `--json` it shall give `needsNoApproval: "plugin"` with `ok: true`, not an error. A connector whose tools are built into Halonic shall get `needsNoApproval: "built_in"` the same way.

## Examples

- Given Acme's connector `lf` with `transport: { plugin: { id: files } }`,
  when `halonic tools review lf` runs,
  then it prints "lf is a plugin's connector. Its tools need no approval: trusting the plugin covers them." and exits 0.
- Given the same,
  when `halonic tools approve lf --all --json` runs,
  then the document has `ok: true`, no tools approved and `needsNoApproval: "plugin"`.
