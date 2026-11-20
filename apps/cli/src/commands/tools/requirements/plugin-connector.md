# cli.commands.tools.plugin-connector

- Status: active
- Since: unreleased
- Source: HAL-12638 (Nina's C54 docs check on HAL-12634, item P18); HAL-14296 (C41 on HAL-14271) for a plugin that isn't added or is off

When `halonic tools review <source>` or `halonic tools approve <source>` names a plugin's connector, the command shall start nothing and first check that the plugin it uses is added (`cli.connector-plugin`). When the plugin isn't added, it shall exit 4 with "✕ lf uses the plugin files, which isn't added." and "Add it with halonic plugin add <folder>.", or "Did you mean filez?" when an added plugin's id is close. Otherwise it shall say that its tools need no approval because trusting the plugin covers them, show no report link and exit 0. While the plugin is off, it shall add a warning marked with !: "files is off: changed since you trusted it · halonic trust --plugin files", "files is off: not trusted yet · halonic trust --plugin files", or, for a plugin whose folder can't be read or checked, "files can't be read or checked, so it's off. See halonic plugin list.". With `--json` it shall give `needsNoApproval: "plugin"` with `ok: true`, not an error, and the plugin's state as `pluginState`: `on`, `off` or `broken`. A connector whose tools are built into Halonic shall get `needsNoApproval: "built_in"` the same way.

## Examples

- Given Acme's connector `lf` with `transport: { plugin: { id: files } }` and the plugin `files` added and on,
  when `halonic tools review lf` runs,
  then it prints "lf is a plugin's connector. Its tools need no approval: trusting the plugin covers them." and exits 0.
- Given the same,
  when `halonic tools approve lf --all --json` runs,
  then the document has `ok: true`, no tools approved and `needsNoApproval: "plugin"`.
- Given Acme's connector `lf` with `transport: { plugin: { id: files } }` and no plugin added,
  when `halonic tools review lf` runs,
  then it prints "✕ lf uses the plugin files, which isn't added." and "Add it with halonic plugin add <folder>." and exits 4.
- Given the same with the plugin `files` added and changed since it was trusted,
  when `halonic tools review lf` runs,
  then it prints the line above and the warning "! files is off: changed since you trusted it · halonic trust --plugin files", and exits 0.
