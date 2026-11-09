# kit.list

- Status: active
- Since: 0.1.0
- Source: HAL-1289; base component specs 6, 18.3, 0.2, 23 A2, A6 and A10; HAL-1639 (kit T1 design check 3, F21 to F30)

The kit's `List` shall render its rows as a named `grid`, named by its `heading` (drawn above it with `ListHeading`) or else by its `label`, one of which its type shall require, in one box with a 1px `border` and a 12px radius and rows divided by 1px `border` lines. A row shall be 56px high with a meta line, 40px without and 32px when `dense` (at least 48px with a 20px icon under a coarse pointer), padded 16px left and right, with an optional icon (20px, or 16px in a 32px `dense` row) or 28px avatar hidden from screen readers, a `text-body-strong` title, a `text-small` `fg-muted` meta line cut with an ellipsis, and an optional trailing chip or value. A row shall take the `surface-subtle` fill on hover and press, faded in with `transition-colors`, an inset 2px `accent` ring on keyboard focus, and, when selected, the `accent-soft` fill, a 2px `accent` bar at its start, inset 8px from a bordered box's rounded corners, an outline round the row in forced colours, and `aria-selected="true"`. The list shall be one Tab stop: the up and down arrow keys, Home and End shall move focus between rows, the right arrow key shall reach a row's More button and the left arrow key bring focus back, and none of them nor Space shall scroll the page, even where focus can't move. When the user presses Enter on a row or clicks it, the kit shall call `onOpen` with the row's id, except while an input method is composing; with Ctrl or Meta held, Enter, a click and a middle click shall call `onOpenInNewTab` instead, and do nothing without it; with Shift or Alt held they shall do nothing. When the list allows selection, Space shall toggle the row, and so shall a click when there is no `onOpen`. A row's More button shall be named for its row ("More actions for Sorter"), 28px in a `dense` list, and, on desktop, shown on hover and while the row has focus, and always on a touch screen. The box shall not clip its rows' focus rings. An `unavailable` row shall stay focusable and readable, with its title and icon in `fg-disabled` (`GrayText` in forced colours), its avatar at 45%, its reason in `fg-muted` in place of its meta line and linked to the row with `aria-describedby`, no hover or press fill and a `not-allowed` cursor, and shall not open or select. A row with an `error` shall show the reason in `danger` in place of its meta line and a `danger` chip in place of its trailing part, and shall still open. When the focused row is removed, focus shall go to the row that took its place, else to the one before it. When the presentation is `phone`, or `flush` is set, the list shall have no outer border or radius and its lines shall start at 16px, drawn as borders so forced colours keep them; on a phone rows shall be at least 56px high, padded 12px 16px (48px with 8px padding and a 20px icon when `dense`), the More button always shown, and a row with a More button shall put its trailing chip at the start of its meta line.

## Examples

- Given a List of Sorter, Writer and Checker with focus on Sorter,
  when the user presses the down arrow key and then Enter,
  then focus is on Writer and `onOpen` is called with Writer's id.
- Given rows with a More button labelled "More actions for Sorter",
  when the user presses the right arrow key on Sorter,
  then focus is on Sorter's More button.
- Given a row with `error={{ reason: "File has an error", chip: "Error" }}`,
  when it renders,
  then its meta line reads "File has an error" in `danger` and a `danger` chip reads "Error".
- Given a List with `onOpenInNewTab` and focus on Sorter,
  when the user presses Ctrl Enter,
  then `onOpenInNewTab` is called with Sorter's id and `onOpen` isn't.
- Given a row with `unavailable={{ reason: "Still downloading" }}`,
  when it renders,
  then its meta line reads "Still downloading" and the row's cell is described by it.
- Given focus on Writer, the second of three rows,
  when Writer is removed,
  then focus is on Checker.
