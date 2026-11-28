# quick-ask.box-look

- Status: active
- Since: unreleased
- Source: HAL-20746; HAL-20728 message box; HAL-20617 build plan; HAL-20825 look check (dark edge, chip by the first line)

The quick-ask box shall be drawn on the new design's panel, in light and dark alike: the theme's
panel corner (`rounded-panel`) on the raised surface, with the dialogs' shadow and its 1 px edge,
because it floats over any app. In dark, that edge shall be the message box's edge colour
(`--color-border-prompt`, `#353c4c`), drawn as a ring so the corner stays; light keeps the shadow's
edge. Its top row shall be the kit's message box (the prompt look of the kit's `TextArea`), holding
the agent chip, drawn before the text by its first line, and **Ask** at its end by its last line,
with the focus starting in its text.

## Examples

- Given the box showing,
  when it is drawn in light,
  then the box has the panel corner and the dialogs' shadow, and no border of its own.
- Given the box showing,
  when it is drawn in dark,
  then the box has the panel corner, the dialogs' shadow and a 1 px `#353c4c` ring, and no border.
- Given the box showing,
  then its question sits in the kit's message box, with the agent chip and Ask inside it, and the
  focus in the text.
- Given a question three lines long,
  then the agent chip sits by its first line and Ask by its last.
