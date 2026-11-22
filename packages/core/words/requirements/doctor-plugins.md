# words.doctor-plugins

- Status: active
- Since: unreleased
- Source: HAL-14296, from Nina's C340 check on HAL-14271 (code row C40); the words of `halonic tools review` for the same plugin (`cli.commands.tools.plugin-connector`), decided by the team (Liam)

The words package shall word the doctor's Plugins line with one item per problem, in the report's order: a plugin that isn't added as "<connector> uses the plugin <plugin>, which isn't added.", with "Did you mean <near>?" under it when one added plugin's id is close, or else the fix that adds it with `halonic plugin add`; a plugin that is off as "<plugin> is off: not trusted yet" or "changed since you trusted it", with `halonic trust --plugin <plugin>`, the id as one word of the person's shell; and a plugin that can't be read or checked as "<plugin> can't be read or checked, so it's off. See halonic plugin list.". Connector and plugin ids shall be made printable.

## Examples

- Given the connector `orders` uses `acme-order`, which isn't added, and `acme-orders` is close,
  then the items are "orders uses the plugin acme-order, which isn't added." and "Did you mean acme-orders?".
- Given `acme-orders` changed since it was trusted,
  then the item is "acme-orders is off: changed since you trusted it · halonic trust --plugin acme-orders".
