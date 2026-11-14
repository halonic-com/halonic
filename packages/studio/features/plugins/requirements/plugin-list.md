# plugins.plugin-list

- Status: active
- Since: 0.1.0
- Source: HAL-1740; plugin screens design section 3 (HAL-1739); microcopy 24 (HAL-751); UX acceptance checklist 2 (HAL-1952); T16

The Studio shall list the plugins on Library › Plugins: the sentence "Plugins add services, tools and cards to Halonic. They're installed on this computer, for every workspace.", **Add plugin**, then the plugins "Installed on this computer" and the ones "Built in". A row shall show a letter avatar, the plugin's name, its description in quotes and what it adds ("2 tools · settings · 1 command · 1 card · a panel"), and on the right its version and "trusted 3 Nov". A plugin that isn't trusted yet shall have the chip "Not trusted yet", a changed one "Changed since you trusted it", both neutral with the dashed ring; one that can't load shall have a `danger` chip "1 error" or "2 errors" and its first problem. A built-in plugin shall have the chip "Built in". The ⋮ of an installed plugin shall offer Open, Open in new tab, Open folder, Remove trust while it is trusted, and **Remove plugin…**, which asks first; the ⋮ of a built-in plugin shall offer only Open. With no installed plugin it shall say "No plugins yet" with **Add plugin**; while loading it shall show skeleton rows; when it can't load it shall say "Couldn't load your plugins", the reason and **Try again**. A plugin's text shall only show as plain text.

## Examples

- Given the Weather plugin is on, version 1.2.0, trusted on 3 Nov, with the description "The forecast where you are.",
  then its row shows "Weather", "“The forecast where you are.” · 1 tool · 1 command · 1 card · a panel" and "1.2.0 · trusted 3 Nov".
- Given a plugin that isn't trusted yet, then its row has the chip "Not trusted yet".
- Given a plugin that can't load because of 2 problems, then its row has the chip "2 errors" and the first problem's message.
- Given the list of Gmail as a built-in plugin, then its row has the chip "Built in" and its ⋮ offers only Open.
- Given the Weather plugin is trusted, when its ⋮ opens, then it offers Open, Open in new tab, Open folder, Remove trust and Remove plugin….
- Given the person picks **Remove plugin…** and confirms, then the app is asked to remove `weather`.
- Given no installed plugin, then it says "No plugins yet" and **Add plugin** asks for the dialog.
- Given a plugin named `<img src=x onerror=alert(1)>`, then its row shows that text and no image is drawn.
