# workspace.trust-check-reflow

- Status: active
- Since: unreleased
- Source: trust-badge (`workspace.trust-badge`), WCAG 1.4.10; HAL-13170 (C150 TD1), HAL-13186

When the trust check shows a folder's path, a program or a name that is wider than the dialog and has no space or hyphen to break at, the dialog shall break it anywhere, so the dialog never scrolls sideways, also in a window 320 px wide. Text that fits shall break as before.

## Examples

- Given the trust check for "Local" in a folder whose path is 60 characters with no space or hyphen,
  and a window 320 px wide,
  when the person opens the check,
  then the path wraps onto more lines and the dialog doesn't scroll sideways.
