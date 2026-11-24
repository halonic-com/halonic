# kit.menu-status

- Status: active
- Since: unreleased
- Source: HAL-16801 (T14 PR 10); component specs 21.5 (HAL-175); flow-assistant 5.5 (HAL-647)

The Menu shall show for an item, when given, its last-used time after the label in caption size, a `neutral` chip with a count ("2 to review"), and a still 6px `running` dot whose words are read after the label. The Menu shall name an item given a name by it in place of its label, and shall show a footer, when given, under the items, below a divider, as a line that isn't an item; with no items it shows the footer alone.

## Examples

- Given an item "Add a routine" with the time "10:42", running "answering" and the name "Add a routine, 10:42, answering",
  when the menu shows it, then the row shows "10:42" and the running dot, and is named "Add a routine, 10:42, answering".
- Given an item with the count "2 to review", when the menu shows it, then the row shows a neutral chip "2 to review".
- Given the footer "Keeps your 40 most recent chats on this computer.", when the menu shows,
  then the line is under the items and isn't a menu item.
