# studio.settings

- Status: active
- Since: 0.1.0
- Source: HAL-7279 (T11 PR 10); flow-settings 2 and 3 (HAL-646); S1 (HAL-1451)

The desktop app shall register the Settings feature with its other features, so its window opens Settings (`shell.settings-window`) on Mod , and from the command **Settings**, and lists every section a registered feature adds: a `host` or `display` section under "On this computer". The served Studio shall register no Settings until it registers features.

## Examples

- Given the desktop app with a feature that adds the `host` section Agent sandbox, and the folder `/work/acme` open,
  when the user presses Ctrl , on Windows,
  then Settings shows Agent sandbox, listed under "On this computer".
- Given the desktop app,
  when the user opens Ctrl K,
  then the command **Settings** is there.
