# kit.menu

- Status: active
- Since: 0.1.0
- Source: HAL-2808, HAL-1289, HAL-3063; base component specs 14 (Menu), 0.2, 23 A1 and 23.5

The kit's `Menu` shall open from its trigger as a native `popover="auto"` with `role="menu"`, named by the trigger, which shall carry `aria-haspopup="menu"` and an `aria-expanded` that follows the menu, also when the browser closes it on an outside click. When it opens, the kit shall place it with the positioning helper (`kit.popover-position`). When the keyboard opens it, which the trigger's `:focus-visible` shows, the kit shall focus its first item; when the mouse opens it, also on a trigger that keeps its focus ring from the keyboard, the kit shall focus the menu itself, with no item active. The arrow keys, Home and End shall move focus between items, wrapping round and skipping disabled items, and typed letters shall move to the next item whose label starts with them. The focused item, also the one under the pointer, shall take the `surface-muted` fill and set `data-fill="muted"`, with no focus ring. When the pointer leaves the menu, focus shall go back to the menu itself and the fill shall clear. Enter, Space or a click shall call the item's `onSelect`, after closing the menu and returning focus to the trigger; Escape and Tab shall close it and return focus to the trigger; inside a Dialog, Escape shall close only the menu, and the Dialog shall stay open until the next Escape. Danger items shall be shown in `danger` and always last, below one divider, and a divider shall never start or end the menu or appear twice in a row. A disabled item shall stay listed in `fg-disabled` and do nothing. An `unavailable` item shall stay in the arrow order, show its reason as a second line in `text-small` `fg-muted` that describes it, fade only its label and icon to 45%, take 12px of padding above and below on a phone and under a coarse pointer, and ignore Enter and clicks. An item with `keys` shall show them as a Kbd and name them with `aria-keyshortcuts`. On a phone and under a coarse pointer, items shall be at least 48px high with a 20px icon.

## Examples

- Given a Menu with Open, Rename… and Delete agent (danger), listed with Delete agent first,
  when it renders,
  then Delete agent is last, below a divider.
- Given a Menu with Open and Rename…,
  when the mouse opens it,
  then the menu itself has focus and no item has the fill; when the keyboard opens it, Open has focus.
- Given a Menu opened by the mouse, with the pointer on Rename…,
  when the pointer leaves the menu,
  then no item has the fill.
- Given an open Menu with Open, Rename…, a disabled Copy path and Run now,
  when the user presses ArrowDown twice from Open,
  then Run now has focus.
- Given an open Menu,
  when the user presses Escape,
  then the menu closes and the trigger has focus with `aria-expanded="false"`.
- Given an open Menu inside the "Delete agent?" Dialog,
  when the user presses Escape,
  then the menu closes and the Dialog stays open; a second Escape cancels the Dialog.
- Given an open Menu whose Run now item is unavailable with "Finish getting updates first.",
  when the user presses Enter on it,
  then nothing is called and the menu stays open.
