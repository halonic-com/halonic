# app.doctor-plugins

- Status: active
- Since: unreleased
- Source: HAL-14296, from Nina's C340 check on HAL-14271 (rows 20–23, code row C40), decided by the team (Liam)

When the host finds a problem with a plugin that one of the workspace's connectors uses, `halonic doctor` shall show a Plugins line with each problem as the host found it: a plugin that isn't added, with the connector that names it and the one added plugin whose id is close, if there is one; a plugin that is off, because it isn't trusted yet or changed since it was trusted; or a plugin whose folder can't be read or checked. The line shall be marked as failed, and counted with the problems, while a plugin isn't added, because no run on this computer can get its tools; otherwise it shall be marked as a warning and counted with the warnings. Without a problem, or outside a workspace, there shall be no Plugins line.

## Examples

- Given a connector `orders` that uses the plugin `acme-order`, which isn't added, and `acme-orders` added,
  then the report has a Plugins line ✕ naming `orders`, `acme-order` and `acme-orders`, and the summary counts one problem.
- Given the plugin `tides` changed since it was trusted,
  then the Plugins line is ! with `tides` off because it changed, and the summary counts one warning.
- Given every plugin the connectors use is on,
  then there is no Plugins line.
