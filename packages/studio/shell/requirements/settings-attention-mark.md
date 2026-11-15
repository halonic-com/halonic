# shell.settings-attention-mark

- Status: draft
- Since: 0.1.0
- Source: flow-settings 3.1 (HAL-646); HAL-10386

The shell shall mark a section's row in the Settings list with a 16px warning triangle in `warning`, followed by the visually hidden text ", needs attention", when the section's `attention` answer is yes. A section with no `attention`, or one that answers no, fails, or hasn't answered yet, has no mark. The answers are read again when the section shown changes.

## Examples

- Given Models answers yes,
  then the Models row ends in a warning triangle and a screen reader hears "Models, needs attention".
- Given Models answers no,
  then its row has no mark.
- Given Models' answer fails,
  then its row has no mark and the other rows still work.
