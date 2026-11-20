# Decision: tools review names a plugin connector's plugin that isn't added or is off

- Approval: Paperclip task HAL-14296 (from Nina's C340 check on HAL-14271, rows 20–23, code row C41; a team decision by Liam on the approved C336/C337 wording); Liam approves this note in review
- Kind: user-visible

`halonic tools review` and `approve` on a plugin's connector said "Its tools need no approval:
trusting the plugin covers them." and exited 0, also when the plugin was never added, so the agent
silently got none of its tools. Now:

- A plugin that isn't added exits 4 with "✕ orders uses the plugin acme-orders, which isn't added."
  and "Add it with halonic plugin add <folder>.", or "Did you mean acme-orders?" when an added
  plugin's id is one or two letters off.
- A plugin that is added but off keeps the old line and exit 0, and adds a `!` warning with the
  `plugin list` state and its fix: "acme-orders is off: changed since you trusted it · halonic
  trust --plugin acme-orders".
- `--json` gets the plugin's state as `pluginState` (`on`, `off` or `broken`).

The active requirement `cli.commands.tools.plugin-connector` says this now; its examples gain an
added plugin. No test was weakened or skipped: the existing tests run with the plugin added and on,
and get the same output as before.

## Covers

- cli.commands.tools.plugin-connector
