# cli.commands.tools.plugin-connector

- Status: active
- Since: unreleased
- Source: HAL-12638 (Nina's C54 docs check on HAL-12634, item P18); HAL-13716 (a plugin that isn't added); HAL-14296 (C41 on HAL-14271) for a near id and a plugin that is off

When `halonic tools review <source>` or `halonic tools approve <source>` names a plugin's connector, the command shall start nothing, say that its tools need no approval because trusting the plugin covers them, show no report link and exit 0. It shall look the plugin up among the plugins added on this computer (`cli.connector-plugin`). When no plugin with the connector's id is added, a second line shall say so and name `halonic plugin add`, a third line "Did you mean filez?" shall follow when an added plugin's id is close, and the command shall still exit 0. While the plugin is added but off, it shall add a warning marked with !: "files is off: changed since you trusted it · halonic trust --plugin files", "files is off: not trusted yet · halonic trust --plugin files", or, for a plugin whose folder can't be read or checked, "files can't be read or checked, so it's off. See halonic plugin list.". With `--json` it shall give `needsNoApproval: "plugin"` with `ok: true`, not an error, and the plugin's state as `pluginState`: `on`, `off`, `broken` or `not_added`. A connector whose tools are built into Halonic shall get `needsNoApproval: "built_in"` the same way.

## Examples

- Given Acme's connector `lf` with `transport: { plugin: { id: files } }` and the plugin `files` added and on,
  when `halonic tools review lf` runs,
  then it prints "lf is a plugin's connector. Its tools need no approval: trusting the plugin covers them." and exits 0.
- Given the same,
  when `halonic tools approve lf --all --json` runs,
  then the document has `ok: true`, no tools approved and `needsNoApproval: "plugin"`.
- Given the same connector and no plugin `files` added,
  when `halonic tools review lf` runs,
  then it prints the same line, then "The plugin files isn't added, so it has no tools yet. Add it with halonic plugin add <folder or git address>.", and exits 0.
- Given the same connector and only the plugin `filez` added,
  when `halonic tools review lf` runs,
  then it prints the two lines above, then "Did you mean filez?", and exits 0.
- Given the same with the plugin `files` added and changed since it was trusted,
  when `halonic tools review lf` runs,
  then it prints the first line and the warning "! files is off: changed since you trusted it · halonic trust --plugin files", and exits 0.
