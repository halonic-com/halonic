# kit.picker-sheet

- Status: active
- Since: 0.1.0
- Source: HAL-3517; base component specs 15.3 (Sheet: the picker sheet), 15.1 and 23 A1

The kit's `PickerSheet` shall be a full-screen sheet: a `<dialog>` opened with `showModal()`, filling the screen at the height of the shell's column (`--app-height`, else `100dvh`), with a `surface` fill and no radius, shadow or visible overlay. Its top bar shall be at least 56px plus the top safe area, with a `border` line below, Close at the left as a 48px icon button, and the field's label as the title, which shall take focus when the sheet opens and name the dialog. It shall show an optional explanation line in `text-small` `fg-muted`, and a search field that narrows the options by name only when there are 11 options or more. It shall list the options as native radios in one radio group named by the title, each a row padded 8px 16px, at least 56px high with a description line and 48px without, with a 1px `border` line under it (the last row too), named by its label and described by its description; the option it was opened with shall be checked, with a 20px `accent` check at the right edge. When the user taps an option, or presses Enter or Space on it, the sheet shall call `onPick` with its value, once. When an arrow key moves the check, the sheet shall move the check without calling `onPick`, even though the browser fires `click` on the radio it moves to. When the user presses Close or Escape, the sheet shall call `onClose` and not `onPick`, so that the field keeps the value it had. An `unavailable` option shall stay listed, native `disabled`, with its reason as its description, and shall never be picked. With no options, the sheet shall show its `empty` line in `text-body` `fg-muted`.

## Examples

- Given a picker sheet "Model" opened with Sonnet,
  when the user taps Haiku,
  then `onPick` is called with `haiku`.
- Given a picker sheet with Sonnet focused,
  when the user presses the down arrow,
  then Haiku is checked and `onPick` isn't called.
- Given a picker sheet opened with Sonnet,
  when the user presses Close,
  then `onClose` is called and `onPick` isn't.
- Given an option Opus unavailable with "Needs an Anthropic key.",
  when the sheet renders,
  then Opus is listed, disabled and described by "Needs an Anthropic key.".
