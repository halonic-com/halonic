# kit.dialog-described-by

- Status: active
- Since: unreleased
- Source: HAL-12310 (the UX check on HAL-12234, item 4); UX 2.1

When a `Dialog` names a line of its body with `describedBy`, the kit shall add that line to the Dialog's description, after the body when the body describes it and before the footnote, so a screen reader reads it when the Dialog opens, also in a `form`, whose fields it doesn't read. In a `form` Dialog on a phone, the line shall describe the form sheet.

## Examples

- Given a `form` Dialog "New agent" whose body ends with the line "It starts with the workspace's default model." and names it with `describedBy`,
  when it mounts,
  then the Dialog is described by that line only, not by its fields.
- Given that Dialog also has the footnote "You can rename it later.",
  then it is described by the line, then the footnote.
- Given that Dialog on a phone,
  then the form sheet is described by the line.
