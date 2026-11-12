# shell.settings-container

- Status: active
- Since: 0.1.0
- Source: HAL-1294 (T11); flow-settings 3 (HAL-646); UX checklist part 3, 3.1 and 3.3 (HAL-1185); save model (HAL-1102)

When Settings opens, the shell shall show a dialog named "Settings" with a ✕ and no footer, a list named "Settings sections" on the left and the current section on the right, under its name as a heading. The list shall show the open workspace's sections under a heading that reads the workspace's name, then "Workspace settings", and then, in the desktop app, the `display` and `host` sections under "On this computer". In a browser, the shell shall list the `display` sections under "In this browser" and the `host` sections under "On the computer running Halonic". The shell shall leave out a group with no sections, and the workspace's group when no workspace is open. The current section's row shall be marked as the current page. If a section's view fails to load, then the shell shall still show the list and the section's name.

## Examples

- Given the workspace Acme is open, with the sections Models (workspace), Appearance (display) and Assistant (host),
  when Settings opens in the desktop app,
  then the list reads "Acme, Workspace settings" over Models, then "On this computer" over Appearance and Assistant.
- Given the same sections,
  when Settings opens in a browser,
  then "In this browser" heads Appearance and "On the computer running Halonic" heads Assistant.
- Given no workspace is open,
  when Settings opens,
  then the list has no workspace heading and no Models row.
- Given the view of Assistant fails to load,
  when Assistant is shown,
  then its heading "Assistant" shows and the list still works.
