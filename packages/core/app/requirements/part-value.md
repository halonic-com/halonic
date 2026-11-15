# app.part-value

- Status: active
- Since: 0.1.0
- Source: HAL-1302 (T9) Create version; save model 2.6 (HAL-1102): Important settings are always shown as before → after

When the part-value function reads a part of an item's YAML text, it shall give the value at that part, or say that there is none when the text is missing, doesn't read, or has no such part.

## Examples

- Given the text `model: large`, when the part `model` is read, then the value is "large".
- Given the same text, when the part `tools` is read, then there is none.
- Given a text of `null` or `: : :`, when any part is read, then there is none.
- Given the part `states › classify` of a workflow, then the value is that step as a whole.
