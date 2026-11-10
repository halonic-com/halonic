# kit.context-menu

- Status: active
- Since: 0.1.0
- Source: HAL-1290; base component specs 14 (Menu); UX checklist part 1, 1.2 (the window tab menu)

The kit's `ContextMenu` shall be a Menu for something that isn't a button, opened by its owner on a right-click, Shift F10 or the Menu key: a native `popover="auto"` with `role="menu"`, named by its `label`, with the Menu's look, items and keys (`kit.menu`). While its `target` is set, the menu shall be open. When the target has a point, the kit shall place the menu at that point and focus the menu itself; when it has none, the kit shall place it 4px below the target's element with the positioning helper (`kit.popover-position`) and focus its first usable item. Escape and Tab shall close it and give the focus back to the element. A pick shall close it and give the focus back to the element before the item's `onSelect` runs. When the menu closes by itself, on Escape, Tab, a pick or an outside click, the kit shall call `onClose`; when the owner sets `target` back to `undefined`, the menu shall close without calling it. A right-click on the open menu shall not open the browser's own context menu.

## Examples

- Given a tab with a ContextMenu labelled "Support reply",
  when the user right-clicks the tab at (120, 30),
  then the menu opens with its top left corner at that point, named "Support reply", and the menu itself has the focus.
- Given the same tab focused,
  when its owner opens the menu without a point (Shift F10),
  then the menu opens 4px below the tab and Close, its first usable item, has the focus.
- Given the menu open from the keyboard,
  when the user presses Escape,
  then the menu closes, the tab has the focus again, and `onClose` is called once.
- Given the menu open,
  when the user picks Close,
  then the menu closes and the tab has the focus before Close's `onSelect` runs.
- Given the menu open,
  when the user clicks outside it,
  then `onClose` is called; and a right-click on the tab opens it again at the new point.
