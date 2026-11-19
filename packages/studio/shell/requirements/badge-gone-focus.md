# shell.badge-gone-focus

- Status: draft
- Since: unreleased
- Source: HAL-13143 (C144 TR1, WCAG 2.4.3, decided by the designer on the task); a11y W1

When a header badge that has focus goes, as "Not trusted yet · Review" does once the workspace is trusted, the window shall give focus to the shown page's `h1`, so the next Tab doesn't start from the top of the window. A badge that goes while something else has focus shall leave focus where it is.

## Examples

- Given the badge "Not trusted yet · Review" has focus on the page "Acme",
  when the badge goes,
  then focus is on the `h1` "Acme".
- Given the page's **Run** has focus,
  when the badge goes,
  then focus stays on **Run**.
