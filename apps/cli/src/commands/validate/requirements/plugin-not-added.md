# cli.commands.validate.plugin-not-added

- Status: active
- Since: unreleased
- Source: HAL-15123, from Iris's flow check C544 (HAL-15101), item 4; the words are `halonic tools review`'s for the same case (`cli.connector-plugin`, HAL-14296), decided by the team

When `halonic validate` checks a workspace with a plugin connector whose plugin isn't added on this computer (`cli.connector-plugin`), such as after `halonic plugin remove`, it shall list a warning on the connector's file with the code `plugin-not-added`: "The plugin acme-orders isn't added, so it has no tools yet. Add it with halonic plugin add <folder or git address>.", followed by "Did you mean acme-orders?" when one added plugin's id is close. A warning doesn't fail the check, so it shall still exit 0 unless `--strict` is given. A plugin that is added, on or off, shall get no such warning, and when the plugins folder can't be listed, no plugin connector shall get it.

## Examples

- Given a connector with `transport: { plugin: { id: acme-orders } }` and no plugin added,
  when `halonic validate` is run,
  then it lists the warning `plugin-not-added` on the connector's file and exits 0.
- Given only the plugin `acme-orders` added and a connector using `acme-order`,
  when `halonic validate` is run,
  then the warning ends with "Did you mean acme-orders?".
- Given the plugin `acme-orders` added,
  when `halonic validate` is run,
  then the connector gets no warning.
