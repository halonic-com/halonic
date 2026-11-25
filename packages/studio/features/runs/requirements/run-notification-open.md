# runs.run-notification-open

- Status: draft
- Since: unreleased
- Source: HAL-18882, Liam's review of halonic#6217 (HAL-18844); the click of `runs.run-notifications`

When Studio's page starts with a run notification's click waiting (`studio.src-tauri.run-notification-cold-open`), or the person clicks a run notification while the page is open, the Studio shall open the run's own page when the click names a run of the open workspace, Runs when it names a run the workspace doesn't list, and Runs filtered to Failed when it names the Failed group (`runs-failed`). It shall hear the click by its kind, so a notification another page showed opens the same way. It shall only show the run: it never stops, starts or changes one.

## Examples

- Given the workspace lists run `run-acme-7` and the shell holds a click on it,
  when Studio's page starts,
  then the run's page opens, once.
- Given a click on the Failed group,
  then Runs opens with the Failed chip chosen.
- Given an open page with no callback for the notification,
  when the person clicks a run notification,
  then the run's page opens.
