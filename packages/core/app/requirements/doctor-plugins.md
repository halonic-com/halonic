# app.doctor-plugins

- Status: active
- Since: unreleased
- Source: HAL-14296, from Nina's C340 check on HAL-14271 (rows 20–23, code row C40); the words in the approved C336 form, decided by the team (Liam)

While it runs inside a workspace, `halonic doctor` shall check the plugin each plugin connector uses, as the host found it among the plugins added on this computer. While a plugin isn't added, it shall show a Plugins line marked as failed, naming the connector and the plugin, and a close plugin id when there is one, so the command exits 1. While a plugin is added but off, because it isn't trusted yet, changed since it was trusted or can't be read or checked, and none is missing, the line shall be a warning. While every plugin is on, or outside a workspace, there shall be no Plugins line.

## Examples

- Given the connector `orders` using `acme-orders`, which changed since it was trusted,
  then the Plugins line is ! and says `acme-orders` is off because it changed.
- Given the connector `orders` using `acme-order`, with only `acme-orders` added,
  then the Plugins line is ✕, names `orders`, `acme-order` and the close `acme-orders`, and `doctor` exits 1.
- Given every plugin the connectors use on,
  then there is no Plugins line.
