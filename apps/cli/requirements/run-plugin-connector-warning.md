# cli.run-plugin-connector-warning

- Status: active
- Since: unreleased
- Source: HAL-14296 (C13+ on Nina's C340 check, HAL-14271: a plugin that wasn't added, was off, had changed or couldn't start its sandbox gave the same ✓ run, with no word on why the agent had none of its tools)

When a run's log has a `connector.listing-failed` event for a plugin connector, `halonic run` shall warn as `cli.run-connector-warning` does, with line 1 "! <connector> didn't start, so its tools are off in this run." and, indented under it, the real reason in the words of `halonic tools review` (`cli.commands.tools.plugin-connector`): for the cause `sandbox-not-ready`, "The sandbox its plugin runs in can't start on this computer." and "See why with halonic doctor."; for another cause, when the plugin isn't added on this computer, "The plugin <id> isn't added, so it has no tools yet. Add it with halonic plugin add <folder or git address>.", then "Did you mean <near>?" when an added plugin's id is close; and when its folder can't be read or checked, "<id> can't be read or checked, so it's off. Remove it with halonic plugin remove <id>, then add a version that works.". It shall read the plugins in the profile once, before the run, and only when a connector uses one. When the plugin is on or off, or the plugins can't be listed, the warning shall be the plain one of `cli.run-connector-warning`: a plugin that isn't trusted or changed since has its own cause in the log (`plugin-not-trusted`, `plugin-changed`) and its own lines there, so one case never has two wordings. The warning shall not change the run's result or its exit code.

## Examples

- Given Acme's Writer lists the connector `handbook`, which uses the plugin `acme-orders`, and no plugin is added,
  when `halonic run support-reply` runs,
  then stderr has "! handbook didn't start, so its tools are off in this run.", "  The plugin acme-orders isn't added, so it has no tools yet. Add it with halonic plugin add <folder or git address>." once, and the run goes on with exit 0.
- Given `handbook` uses `acme-orders` and the added plugin `acme-order` is close to it,
  when the warning is given,
  then its last line is "  Did you mean acme-order?".
- Given `acme-orders` changed since it was trusted and a `connector.listing-failed` with `why: "plugin-changed"`,
  when the warning is given,
  then it is the one `cli.run-connector-warning` gives for that cause, as for a connector that isn't a plugin's.
- Given `acme-orders` can't be read or checked,
  when the warning is given,
  then its second line is "  acme-orders can't be read or checked, so it's off. Remove it with halonic plugin remove acme-orders, then add a version that works.".
- Given a `connector.listing-failed` with `why: "sandbox-not-ready"`,
  when the warning is given,
  then it names the sandbox and `halonic doctor`; and given `why: "other"` for a plugin that is on, the warning is the plain one.
