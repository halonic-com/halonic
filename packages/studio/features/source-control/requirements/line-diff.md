# source-control.line-diff

- Status: active
- Since: unreleased
- Source: HAL-1302 (T9); ux-checklists-t8-t9 (HAL-1360) part 2, Advanced diff; a11y 13.5

Under **Advanced**, the Changes page shall show the line diff of a changed file in one full-width column, for everyone and not only the developer view. Each part shall have a heading that says where it is, "Line 12" or "Lines 12 to 18", counted from 1 in the file as it is now, or in the last version when the part only removes lines. Each line shall carry a + or − glyph as well as its tint, and shall begin with the hidden words "Added line:" or "Removed line:" for a screen reader. Advanced shall be closed, except for a file Halonic can't describe, where it starts open.

## Examples

- Given `hub.yaml` has line 1 and line 8 changed,
  when the person presses Advanced,
  then the parts read "Line 1" and "Line 8", and the changed lines read "Removed line: - a" and "Added line: + A" to a screen reader.
