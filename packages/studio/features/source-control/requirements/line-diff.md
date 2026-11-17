# source-control.line-diff

- Status: active
- Since: 0.1.0
- Source: HAL-1302 (T9); ux-checklists-t8-t9 (HAL-1360) part 2, Advanced diff; a11y 13.5

While the developer view is on, the line diff of a changed file shall give each part a heading that says where it is, "Line 12" or "Lines 12 to 18", counted from 1 in the file as it is now, or in the last version when the part only removes lines. Each line shall carry a + or − glyph as well as its tint, and shall begin with the hidden words "Added line:" or "Removed line:" for a screen reader.

## Examples

- Given the developer view is on and `hub.yaml` has line 1 and line 8 changed,
  when the person presses Show lines,
  then the parts read "Line 1" and "Line 8", and the changed lines read "Removed line: - a" and "Added line: + A" to a screen reader.
