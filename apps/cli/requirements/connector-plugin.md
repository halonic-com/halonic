# cli.connector-plugin

- Status: active
- Since: unreleased
- Source: HAL-14296, from Nina's C340 check on HAL-14271 (rows 20–23, code rows C40, C41 and C13+); the words in the approved C336 form, decided by the team (Liam)

When the `halonic` command checks the plugin a plugin connector uses, it shall find it among the plugins added on this computer by exactly its id, and say whether it is on, off because it isn't trusted yet or changed since it was trusted, broken because its folder can't be read or checked, or not added. A plugin that isn't added shall come with the one added plugin whose id is close to it, if there is exactly one, so a typo in the connector's file can be named.

## Examples

- Given the plugin `orders` added and changed since it was trusted,
  when a connector using `orders` is checked,
  then it is off, because it changed.
- Given only the plugin `acme-orders` added,
  when a connector using `acme-order` is checked,
  then it isn't added, and `acme-orders` is named as close.
