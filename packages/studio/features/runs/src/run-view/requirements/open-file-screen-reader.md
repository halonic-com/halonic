# runs.run-view.open-file-screen-reader

- Status: active
- Since: unreleased
- Source: keyboard and screen-reader check RU1 and RU2 on the run's saved file page (HAL-18044); details of the approved page (`runs.run-view.open-file`), a team decision under HAL-2282 (HAL-18076)

When the person presses **Try again** on a run's saved file page (requirement `runs.run-view.open-file`), the page shall move focus to its `h1`, the file's name, and when the file still can't be read, its "Couldn't load _name_" shall be in an alert, so a screen reader reads it. The frame that shows the file's text shall be a region named by the page's `h1`, never by the file's text.

## Examples

- Given the saved file weekly-report.md couldn't be read,
  when the person presses **Try again** and it fails again,
  then focus is on the `h1` "weekly-report.md" and the screen reader hears "Couldn't load weekly-report.md".
- Given the saved file weekly-report.md is open,
  when a screen reader reaches its text,
  then it hears the region "weekly-report.md".
