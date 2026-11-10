# kit.menu-description

- Status: active
- Since: 0.1.0
- Source: HAL-3521; base component specs 20.2 (revision 17) and 14; visual review kit T1-F51

The kit's `Menu` shall take an optional `description`, a sentence that explains the menu. When it has one, the kit shall show it as the menu's first row, above the items, in `text-small` `fg-muted`, with 8px of padding above and at the sides and 6px below, at most 300px wide and wrapping, and with the Menu's divider under it. The description shall not be an item: it shall have no `role`, shall not be focusable, and the arrow keys, Home, End and type-to-find shall pass it by. The menu shall point `aria-describedby` at it, so a screen reader reads it once when the menu opens. Without a `description`, the menu shall have no `aria-describedby` and start with its first item.

## Examples

- Given a Menu with the description "Runs on the built-in test model, with scripted replies. No key, no cost." and the items Run its tests and Start your own workspace,
  when it renders,
  then the description is the first row, a divider follows it, and the menu's `aria-describedby` points at it.
- Given that Menu opened from the keyboard,
  when it opens,
  then Run its tests has focus; and when the user presses Home or the arrows, the focus never lands on the description.
- Given that Menu opened from the mouse,
  when the user types "r",
  then Run its tests has focus.
- Given a Menu without a description,
  when it renders,
  then the menu has no `aria-describedby` and its first child is an item.
