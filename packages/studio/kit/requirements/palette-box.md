# kit.palette-box

- Status: active
- Since: 0.1.0
- Source: HAL-1290 (T2); component specs 24.3 and 8 (HAL-175); UX checklist part 1, 1.7 (HAL-1323); accessibility pass 1.6 (HAL-967)

The kit's `PaletteBox` shall open as a modal `<dialog>` named by its `label` while it is mounted, and shall move focus to the element `initialFocus` returns. It shall be 600px wide, never closer than 16px to the window's sides, 96px from the window's top, centred, and shall grow with its content until 96px above the window's bottom, with the Dialog's fill, radius, shadow, overlay and fade. When the user presses Escape, the box shall run `onCancel` and shall not close by itself. When the user presses and releases on the overlay, the box shall run `onCancel`, also after something was typed. When the screen unmounts it, focus shall go back to the element that opened it. While it is open, its own polite and assertive live regions shall take the announcer's messages.

## Examples

- Given Home with the sidebar's Search focused,
  when the palette opens,
  then a dialog named "Search" is open and its search box has focus.
- Given the palette is open and "refund" is typed,
  when the user clicks the overlay,
  then `onCancel` runs.
- Given the palette was opened from Search,
  when the screen unmounts it,
  then Search has focus again.
