# cli.doctor-plugins

- Status: active
- Since: unreleased
- Source: HAL-14296, from Nina's C340 check on HAL-14271 (rows 20–23, code row C40); the words in the approved C336 form and those of `tools review` (`cli.commands.tools.plugin-connector`), decided by the team (Liam)

Inside a workspace, `halonic doctor` shall check the plugin each plugin connector uses against the plugins added in the profile (`cli.connector-plugin`), and show what is wrong on a Plugins line after Models and before Sandbox (`app.doctor-plugins`). It shall name each connector whose plugin isn't added, marked with ✕, as "orders uses the plugin acme-order, which isn't added. Did you mean acme-orders?", or with "Add it with halonic plugin add <folder>." when no added id is close, and exit 1. It shall name each plugin that is off once, however many connectors use it, marked with !, as "acme-orders is off: changed since you trusted it · halonic trust --plugin acme-orders", "… is off: not trusted yet · …", or "acme-orders can't be read or checked, so it's off. See halonic plugin list.", and exit 0 when nothing else fails. With `--json`, the check shall be `plugins`, with each problem. Validating the files doesn't check plugins: they live on each computer, not in the workspace, so `halonic validate` gives the same answer on every computer.

## Examples

- Given Acme with the connector `orders` using `acme-order`, and only `acme-orders` added,
  when `halonic doctor` runs,
  then it prints "✕ Plugins     orders uses the plugin acme-order, which isn't added. Did you mean acme-orders?" and exits 1.
- Given Acme with two connectors using `acme-orders`, which changed since it was trusted,
  when `halonic doctor` runs,
  then it prints "! Plugins     acme-orders is off: changed since you trusted it · halonic trust --plugin acme-orders" once and exits 0.
