# Decision: tools review names a plugin connector's plugin that isn't added or is off

- Approval: Paperclip task HAL-14296 (from Nina's C340 check on HAL-14271, rows 20–23, code row C41; a team decision by Liam on the approved C336/C337 wording); Liam approves this note in review
- Kind: user-visible

`halonic tools review` and `approve` on a plugin's connector said "Its tools need no approval:
trusting the plugin covers them." and exited 0, also when the plugin was off, so the agent silently
got none of its tools. Owen's HAL-13716 (#4032) already added a second line for a plugin that isn't
added, with exit 0; this builds on it and keeps that line and exit code. Now:

- A plugin that isn't added keeps HAL-13716's line, and gets "Did you mean acme-orders?" after it
  when an added plugin's id is close, so a typo in the connector's file is named.
- A plugin that is added but off keeps the first line and exit 0, and adds a `!` warning with the
  `plugin list` state and its fix: "acme-orders is off: changed since you trusted it · halonic
  trust --plugin acme-orders".
- `--json` gets the plugin's state as `pluginState` (`on`, `off`, `broken` or `not_added`).
- One way to read the plugins: the tools machine's `pluginAdded(id)` becomes `plugins`, the added
  plugins with their state (`cli.connector-plugin`), which `plugin list` shares too.

The active requirement `cli.commands.tools.plugin-connector` says this now; its examples gain a near
id and a plugin that is off. No test was weakened or skipped: HAL-13716's tests keep their output.

## Covers

- cli.commands.tools.plugin-connector
