# shell.close-stack

- Status: active
- Since: 0.1.0
- Source: HAL-965 (E3, rule A7), HAL-973

The shell shall give each window one close stack, `shell.closeStack`, where a layer registers when it opens and leaves when it closes. When Esc is pressed or Android's Back is used, the shell shall close the first active layer by rank: inline edit, menu, tooltip, dialog or sheet, drawer (the agent map's summary drawer, the narrow window's Places drawer), stacked card, docked card, maximise, side panel. Within one rank, the shell shall close the layer opened last. A layer that says it isn't active, such as the side panel while focus is outside it, shall not count. If a layer refuses to close, then the shell shall keep it and still use up the key press. While an input method is composing, the shell shall ignore Esc. When no layer is active, `escape` and `back` shall report that they did nothing, so the key goes on and Back navigates. If a layer's kind isn't one of the ranks, then the shell shall throw a `ShellError`.

## Examples

- Given a side panel, a stacked card and a dialog are open and then a tooltip and a menu,
  when Esc is pressed five times,
  then the menu, the tooltip, the dialog, the card and the panel close, in that order.
- Given a dialog was opened after a stacked card, and a sheet after the dialog,
  when Esc is pressed,
  then the sheet closes first; the dialog shares its rank and closes next.
- Given a menu over a docked card,
  when Back is used on Android,
  then the menu closes, as it would on Esc.
- Given the side panel is open but focus is in the editor,
  when Esc is pressed,
  then the side panel stays open.
- Given a dialog with typed text that asks before closing,
  when Esc is pressed,
  then the dialog stays open and the layer below it doesn't close.
