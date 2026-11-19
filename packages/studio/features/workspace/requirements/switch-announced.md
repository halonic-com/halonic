# workspace.switch-announced

- Status: active
- Since: unreleased
- Source: accessibility status W1b, WCAG 4.1.3 (HAL-12988, HAL-12912); words decided by the team as designer (HAL-12997)

When the user's own action shows a workspace that was already open, by Ctrl 1 to Ctrl 9, a row of the workspace menu, **Open a folder…** or a Recent row for a folder that's already open, or by closing the shown workspace, the window shall read "Switched to *name*" politely through its announcer after focus moves to the page title. The window shall not read it when a workspace opens, because its "Opened *name*" toast is read, nor when a workspace is shown by the restore at start.

## Examples

- Given "acme" and "beta" are open and "acme" is shown,
  when the user presses Ctrl 2,
  then focus is on Home's title and a screen reader hears "Switched to beta".
- Given "acme" is open,
  when the user opens the folder "beta" from **Open a folder…**,
  then the "Opened beta" toast is read and "Switched to beta" is not.
- Given "acme" and "beta" are open and "beta" is shown,
  when the user closes "beta",
  then a screen reader hears "Switched to acme".
