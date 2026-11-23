# words.doctor-plugins

- Status: active
- Since: unreleased
- Source: HAL-14296, from Nina's C340 check on HAL-14271 (code row C40); the words of `halonic tools review` for the same plugin (`cli.commands.tools.plugin-connector`), decided by the team (Liam); the cost, the near id's fix and the broken plugin's fix from Nina's C609 check (HAL-15656), decided by the team; the plugin records' words and fixes of `cli.plugin-record-unreadable` (HAL-15893), for the doctor (HAL-15916), decided by the team under HAL-2282

The words package shall word the doctor's Plugins line with one item per problem, in the report's order: a plugin that isn't added as "<connector> uses the plugin <plugin>, which isn't added, so <connector> has no tools yet.", with "Did you mean <near>?" under it when one added plugin's id is close and then the fix "Fix: change the plugin id in <connector>.connector.yaml to <near>, or add <plugin> with halonic plugin add <folder or git address>, then run halonic doctor again.", or else the fix that adds it with `halonic plugin add`; a plugin that is off as "<plugin> is off: not trusted yet" or "changed since you trusted it", with `halonic trust --plugin <plugin>`, the id as one word of the person's shell; and a plugin that can't be read or checked as "<plugin> can't be read or checked, so it's off." with the fix "Fix: remove it with halonic plugin remove <plugin>, then add a version that works.", the id as one word of the person's shell; a plugin record file or their folder the person may not open as "The plugin record file <file> can't be read by your user account." or "The plugin records folder <folder> can't be read by your user account.", with the fix `halonic plugin list` gives for it in the doctor's form, "Fix: run chmod 600 <file>, then run halonic doctor again." (700 for the folder), `sudo chown` first when another user owns it, or the Properties on Windows; and a damaged record file as "The plugin record file <file> is damaged at line <n>: <why>", with "Fix: delete line <n> from it, or delete the file, then run halonic doctor again." and what deleting the file forgets for every plugin. Connector and plugin ids, and the paths, shall be made printable.

## Examples

- Given the connector `orders` uses `acme-order`, which isn't added, and `acme-orders` is close,
  then the items are "orders uses the plugin acme-order, which isn't added, so orders has no tools yet.", "Did you mean acme-orders?" and "Fix: change the plugin id in orders.connector.yaml to acme-orders, or add acme-order with halonic plugin add <folder or git address>, then run halonic doctor again.".
- Given `acme-orders` changed since it was trusted,
  then the item is "acme-orders is off: changed since you trusted it · halonic trust --plugin acme-orders".
- Given the record file that keeps where each plugin was added from is damaged at line 2,
  then the items are "The plugin record file <file> is damaged at line 2: it is not JSON." and "Fix: delete line 2 from it, or delete the file, then run halonic doctor again. Deleting the file forgets where each plugin was added from; the plugins stay."
