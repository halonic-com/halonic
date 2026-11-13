# plugins.plugin-changes

- Status: active
- Since: 0.1.0
- Source: HAL-1740; plugin screens design section 6 (HAL-1739); UX acceptance checklist 4 (HAL-1952)

The Studio shall open **Review changes** on a plugin that changed since the person trusted it as a dialog titled "*name* changed since you trusted it on *date*", with the change rows core found, each with a tag **New**, **Changed** or **Removed** and, for a change, the old value, an arrow and the new value, then a closed "Unchanged (*n*)" list. Its buttons shall be **Not now**, focused, and **Trust again and turn on**, which trusts the plugin through the app. When core can't compare what was trusted with the plugin, the dialog shall say that something changed and that Halonic can't say what.

## Examples

- Given Weather gained the tool `set_alert`, which changes things, since it was trusted,
  when the person presses **Review changes**,
  then a row tagged **New** says "Tool set_alert" and "Changes things", and "Unchanged (n)" lists the tools that stayed.
- Given a tool went from reading to changing things,
  then its row is tagged **Changed** and shows "Reads", an arrow and "Changes things".
- Given the same,
  when the person presses **Trust again and turn on**,
  then the app trusts the plugin and the dialog closes.
- Given the trust record can't be read,
  then the dialog says "Something in this plugin changed. Halonic can't say what."
