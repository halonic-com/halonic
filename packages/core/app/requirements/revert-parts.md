# app.revert-parts

- Status: active
- Since: 0.1.0
- Source: HAL-3278; HAL-3267 engine answer 5 (generic on `editYaml`, HAL-404)

When parts of an item are reverted to a reference, the revert-parts function shall set each part to its value in the reference, remove it where the reference has none, and put it back right after the key it follows in the reference where the current item has none, keeping the rest of the file's text, comments and formatting as they are; when the result reads the same as the reference, it shall give the reference's text, dropping any comment or spacing changed since the reference.

## Examples

- Given the current workflow has a step `page-oncall` the reference doesn't have, when `states › page-oncall` is reverted, then that step is gone and every other line of the file is unchanged, comments included.
- Given the reference has a step `classify` after `intake` that the current file doesn't, when `states › classify` is reverted, then `classify` is back right after `intake`; when `intake` is gone too, it goes first.
- Given the agent's `model` differs, when `model` is reverted, then only the `model` line changes.
- Given the part is the same in both, then nothing changes.
- Given the only difference left is spacing, when the last changed part is reverted, then the text is the reference's, byte for byte.
- Given a comment was added since the reference and the last changed part is reverted, then the text is the reference's, and that comment is gone.
