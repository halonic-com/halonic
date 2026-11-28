# quick-ask.box-look

- Status: active
- Since: unreleased
- Source: HAL-20746; HAL-20728 message box; HAL-20617 build plan

The quick-ask box shall be drawn on the new design's panel, in light and dark alike: the theme's
panel corner (`rounded-panel`) on the raised surface, with the dialogs' shadow and its 1 px edge,
because it floats over any app. Its top row shall be the kit's message box (the prompt look of the
kit's `TextArea`), holding the agent chip, drawn before the text, and **Ask** at its end, with the
focus starting in its text.

## Examples

- Given the box showing,
  when it is drawn in light or dark,
  then the box has the panel corner and the dialogs' shadow, and no edge of its own.
- Given the box showing,
  then its question sits in the kit's message box, with the agent chip and Ask inside it, and the
  focus in the text.
