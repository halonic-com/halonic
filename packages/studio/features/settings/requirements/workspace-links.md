# settings.workspace-links

- Status: active
- Since: unreleased
- Source: HAL-8027 (T11 PR 9); flow-settings 1.1 and 1.2 (HAL-646); HAL-1294 plan, PR 9

The Settings feature shall add the workspace section Trust (`trust`), with one button, until the feature that owns the page adds its own summary: **Open Trust**. The first line under its name ("Part of Acme. …") comes from the shell (`shell.settings-workspace-line`); the section shall not write it. Models is added by the Models feature (`models.settings.settings-summary`). A press shall close Settings and then run the command `workspace.open-trust` through the window's `runCommand`, so the page opens as Ctrl K opens it. Without a window's `runCommand`, a press shall only close Settings. The section shall show no summary, chip or count.

## Examples

- Given the Studio window with the Settings feature,
  when Settings lists its sections,
  then Trust is under the workspace group.
- Given a window that gives no `runCommand`,
  when the user presses **Open Trust**,
  then Settings closes and nothing else happens.
