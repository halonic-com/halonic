# workspace.open-folder

- Status: active
- Since: 0.1.0
- Source: req-workspace `workspace.switcher.open-beside` (HAL-110), flow-workspace 2.2, microcopy 4.1; HAL-1291

When the user picks a folder, from the Welcome screen's **Open folder** or the workspace menu's **Open a folder…**, or picks a Recent row, the workspace switcher shall open the workspace in that folder beside the open ones, show it, remember it in Recent and show the toast "Opened *name*". If that folder is already open, then it shall show it instead of opening it twice. While a folder is opening, the switcher shall ignore other requests to open one.

## Examples

- Given a window showing the Welcome screen,
  when the user picks `/work/acme`,
  then the window shows "acme", Recent starts with it, and the toast reads "Opened acme".
- Given "acme" and "beta" are open and "beta" is shown,
  when the user picks `/work/acme` again,
  then "acme" is shown and nothing is opened a second time.
