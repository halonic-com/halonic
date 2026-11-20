# settings.sandbox-status-ui

- Status: active
- Since: unreleased
- Source: HAL-5405 (PR 4b); HAL-3777 (plan) the visible badge and Settings → Sandbox; HAL-12350 (Set up a sandbox in the no-sandbox block)

The Studio shall draw the header badge and the Settings status row that `settings.sandbox-status-view` decides, and decide nothing itself. The badge shall show its words in a chip with an icon, so no state rests on colour, shall be named by its words, then "Opens sandbox settings." (for example "Sandbox: on. Opens sandbox settings.") for screen readers, shall show the tooltip "Open sandbox settings", and a press shall open Settings › Agent sandbox; with no badge decided it shall show nothing. The row shall show the state chip, its sentence and one button for each action, in the view's order: **Set up a sandbox** and **Restart now** as the primary step, and **Check again**, **Change** and **Turn off** as quiet buttons. **Check again** shall show busy while a check runs. A press shall only report which action it was. The state and its sentence shall be in a polite live region, so a change is heard.

## Examples

- Given the person chose no sandbox,
  when the row shows,
  then it reads "No sandbox" with the primary button **Set up a sandbox**, and pressing it reports `set-up`.
- Given the saved backend is in use,
  when the badge shows,
  then it reads "Sandbox: on" with an icon, its name is "Sandbox: on. Opens sandbox settings.", and pressing it opens Settings.
- Given the host is still asking,
  when the row shows,
  then it reads "Checking" with a busy **Check again**, and no badge shows.
