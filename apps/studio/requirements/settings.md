# studio.settings

- Status: active
- Since: unreleased
- Source: HAL-7279 (T11 PR 10); flow-settings 2 and 3 (HAL-646); S1 (HAL-1451); groups from HAL-19539

The desktop app shall register the Settings feature with its other features, so its window opens Settings (`shell.settings-window`) on Mod , and from the command **Settings**, and lists every section a registered feature adds, in its group (`shell.settings-dialog-groups`). The served Studio shall register no Settings until it registers features.

## Examples

- Given the desktop app with a feature that adds the `host` section Agent sandbox, and the folder `/work/acme` open,
  when the user presses Ctrl , on Windows,
  then Settings shows Agent sandbox, listed in the Agents group.
- Given the desktop app,
  when the user opens Ctrl K,
  then the command **Settings** is there.
