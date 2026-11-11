# shell.panel-maximise

- Status: active
- Since: 0.1.0
- Source: HAL-1290 (T2); req-shell `panels.maximise` and `keybindings.escape-order` (HAL-110); UX checklist part 1, 1.10 and 1.6 (HAL-1323)

While the item page's panel is beside the chat, the shell shall show a ⤢ button named "Maximise <view>", with that name as its tooltip, before the panel's ✕. When the user presses it, the shell shall make the panel cover the tab's body inside a 112px margin, dim the chat behind it and make the chat inert, keep the header as it is, and turn the button into the restore mark named "Restore <view>", with focus staying on it. When the user presses the restore mark, presses Esc once the dialogs, menus and stacked cards above have closed, or clicks in the margin, the shell shall put the panel back beside the chat at its width, with focus on the ⤢ after a click in the margin. While the panel is maximised it shall have no resize edge, and its view shall keep its state across maximise and restore. When the user presses the panel's ✕ while it is maximised, the panel shall close and the next time it shows it is beside the chat. While the panel is not beside the chat, because the chat is closed, the panel is closed or the tab is too narrow and the panel shows as a button, there shall be no ⤢.

## Examples

- Given agent "Refund checker" with its Flow beside the chat in a 1600px tab,
  when the user presses "Maximise Flow",
  then the Flow covers the tab inside a 112px margin, the chat is dimmed and inert, and focus is on "Restore Flow".
- Given the panel maximised,
  when the user clicks in the margin,
  then the panel is back beside the chat, 700px wide, and focus is on "Maximise Flow".
- Given the panel maximised,
  when the user presses Esc,
  then the panel is back beside the chat.
- Given the panel maximised and a stacked card open on it,
  when the user presses Esc,
  then only the card closes; a second Esc restores the panel.
- Given a tab 800px wide, where the panel shows as a button,
  then there is no "Maximise Flow".
