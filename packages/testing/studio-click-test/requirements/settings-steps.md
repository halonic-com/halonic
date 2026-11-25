# studio-click-test.settings-steps

- Status: active
- Since: unreleased
- Source: HAL-18716 point 6 (the board's yes, 25 Nov), HAL-18867

When the steps of `studio-click-test.steps` have run, the click test shall check Settings on the installed app, each step from a workspace and opening Settings first when it isn't open:

1. **Theme:** Settings › Appearance › Theme **Dark** sets the window's root to `data-theme="dark"`, and **System** then takes it off again.
2. **Formats:** Settings › Formats shows its example, picking **Dutch (Netherlands)** changes it to the Dutch number, and **Follow this computer: …** changes it back.
3. **Agent sandbox and About Halonic:** Settings › Agent sandbox shows a state chip once the host's check answers, without pressing a button, and About Halonic shows **Check now** and **Update Halonic automatically**.

## Examples

- Given a window whose root stays without `data-theme` after Dark is picked,
  then the theme step fails as `THEME_NOT_APPLIED`.
- Given a Formats example that still reads the computer's number after Dutch (Netherlands) is picked,
  then the formats step fails as `EXAMPLE_UNCHANGED`.
- Given Agent sandbox shows "Couldn't check the sandbox: …",
  then the third step fails as `SANDBOX_NOT_CHECKED`.
- Given About Halonic shows "Halonic's updater didn't answer.",
  then the third step fails as `UPDATER_DIDNT_ANSWER`.
