# cli.doctor-plugins

- Status: active
- Since: unreleased
- Source: HAL-14296, from Nina's C340 check on HAL-14271 (rows 20–23, code row C40); the plugin states of `halonic tools review` (`cli.commands.tools.plugin-connector`), decided by the team (Liam)

The `halonic doctor` command shall check each plugin that a connector an agent of the workspace can use names against the plugins added on this computer, as `halonic tools review` does, and show a Plugins line, after Secrets and before Sandbox, when one isn't added, is off or can't be read. A plugin that isn't added shall be marked with ✕, with the connector that names it, and `doctor` shall exit with 1; one that is off or can't be read shall be marked with !, and `doctor` shall still exit with 0. It shall read the profile's plugins only when such a connector uses one. With `--json`, the check shall be `plugins` with its `problems`.

## Examples

- Given the agent Helper uses the connector `orders`, which names the plugin `acme-order`, and only `acme-orders` is added,
  when `halonic doctor` runs,
  then it prints "✕ Plugins     orders uses the plugin acme-order, which isn't added." with "Did you mean acme-orders?" under it, and exits with 1.
- Given `acme-orders` added and changed since it was trusted,
  then it prints "! Plugins     acme-orders is off: changed since you trusted it · halonic trust --plugin acme-orders", and exits with 0.
- Given no agent uses a plugin's connector,
  then there is no Plugins line, and the plugins aren't read.
