# kit.chat-composer-picker

- Status: active
- Since: unreleased
- Source: HAL-18157 (Liam's review of #5922, HAL-17631); WAI-ARIA combobox pattern

Where a `ChatComposer` has a `picker`, its box shall be a combobox: while the picker is open and offers rows, the box shall say it is expanded, point at the picker's listbox and name the active row with `aria-activedescendant`, and each row shall be an option of that listbox, the active one selected. Focus shall stay in the box. While the picker is open, ArrowDown and ArrowUp shall move the active row, wrapping at either end; Enter shall call `onPick` with the active row and not send; and Esc shall call `onClose`. A click on a row shall call `onPick` with that row without taking focus from the box. While an input method is composing, these keys shall belong to the input method. With the picker closed, or open with no rows, Enter shall send as usual.

## Examples

- Given a ChatComposer whose picker is open with Chief, Liam and Elena,
  when the person presses ArrowDown,
  then the box's `aria-activedescendant` names Liam's row, which is selected.
- Given the same ChatComposer with Liam active,
  when the person presses Enter,
  then `onPick` is called with Liam's id and `onSend` isn't called.
- Given the same ChatComposer,
  when the person presses Esc,
  then `onClose` is called.
