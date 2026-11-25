# files.ui.file-review-part-names

- Status: active
- Since: unreleased
- Source: HAL-18077 (a11y check RV4, HAL-18044); AI changes 1.2, "In a file" (HAL-3228)

The file's editor shall name each part of the assistant's changes by its position and what it changed, since the green of added lines is not seen by everyone: "Change 2 of 2: 1 line added at line 7", "Change 1 of 2: 2 lines removed at line 4", or "Change 1 of 1: 1 line added and 1 line removed at line 2".

## Examples

- Given two parts, the second adding 1 line at line 7,
  when a screen reader reaches the second part,
  then it hears "Change 2 of 2: 1 line added at line 7".
