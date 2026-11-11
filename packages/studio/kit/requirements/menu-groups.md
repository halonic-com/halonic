# kit.menu-groups

- Status: active
- Since: 0.1.0
- Source: HAL-1291 (T3); microcopy 4.1 "The workspace menu" (revision 27, g5-frames T3-F26); component specs 24.4 (the workspace switcher, "Group labels")

The kit's `Menu` shall take a heading entry, `{ heading }`, that names the items under it up to the next divider or heading. The kit shall draw the heading in the caption-caps label style (`text-caption`, uppercase, `tracking-label`, `fg-subtle`) and shall put it and its items in a `group` named by the heading. The heading shall not be an item: it shall not be focusable, and the arrow keys, Home, End and type-to-find shall pass it by. A heading with no items under it shall not be drawn. A menu item shall take an optional `detail`, a second line under its label in `text-caption` `fg-subtle`, one line ending in "…", which describes the item (`aria-describedby`) while the item's name stays its label.

## Examples

- Given a Menu with the heading Recent, the items Acme (detail "~/Work/acme") and Beta (detail "~/Work/beta"), a divider and Open a folder…,
  when it renders,
  then Acme and Beta are in a `group` named "Recent", and Open a folder… is outside it after the divider.
- Given that Menu opened from the keyboard,
  when it opens,
  then Acme has focus; and Home, End and the arrows never land on the heading.
- Given that Menu opened from the mouse,
  when the user types "r",
  then nothing is focused by the heading's letter: the focus stays on the menu.
- Given the item Acme with the detail "~/Work/acme",
  when it renders,
  then the detail is a second, truncated line in `text-caption text-fg-subtle`, the item's name is "Acme", and it is described by "~/Work/acme".
- Given a Menu with the heading Recent followed straight by a divider and Open a folder…,
  when it renders,
  then there is no heading and no group.
