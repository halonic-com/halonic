# settings.workspace-links

- Status: active
- Since: 0.1.0
- Source: HAL-8027 (T11 PR 9); flow-settings 1.1 and 1.2 (HAL-646); HAL-1294 plan, PR 9

The Settings feature shall add two workspace sections, Models (`models`) and Trust (`trust`), each with one line and one button, until the features that own those pages add their own summaries: **Open Models** and **Open Trust**. A press shall close Settings and then run the command `workspace.open-models` or `workspace.open-trust` through the window's `runCommand`, so the page opens as Ctrl K opens it. Without a window's `runCommand`, a press shall only close Settings. The sections shall show no summary, chip or count.

## Examples

- Given the Studio window with the Settings feature,
  when Settings lists its sections,
  then Models and Trust are under the workspace group, Models first.
- Given Models shows,
  when the user presses **Open Models**,
  then Settings closes and the command `workspace.open-models` runs.
- Given a window that gives no `runCommand`,
  when the user presses **Open Trust**,
  then Settings closes and nothing else happens.
