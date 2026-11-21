# Decision: a connector whose plugin isn't trusted says so in the run log and in the run's warning

- Approval: Paperclip task HAL-14974 (Kim's C522 finding on HAL-14972: a run with a plugin added but not trusted warned only "couldn't list its tools"); Liam approves this note in review
- Kind: user-visible

A plugin's connector that the person hasn't trusted yet, or whose plugin changed since they
trusted it, refuses to open as a whole. That isn't one part being off, so the log had no
`connector.part-off`, only `connector.listing-failed` with the cause `other`, and `halonic run`
pointed to `halonic tools review` instead of the fix. Now:

- `connectorStartFailureOf` reads the plugin connector's `PluginConnectorNotTrustedError` (for
  `not-trusted` and `changed` only) as `plugin-not-trusted` or `plugin-changed` with the plugin's
  id, and looks for a known error through `cause`, at most 8 deep, because the plugin connector
  wraps its refusal (`ports.connector-start-failure`, `app.plugin-connector-opening`).
- The `connector-not-started` cause gets the two reasons, with the plugin's id in `name`
  (`events.tool-result-cause`, `events.connector-listing-failed`, `engine.tool-result-cause`,
  `engine.connector-listing-failed`). No event or field is added; a reader from before this
  change reads the new reasons as no cause, as it reads any `why` it doesn't know.
- `halonic run` warns "! files didn't start, so its tools are off in this run.", then "The plugin
  files isn't trusted yet." (or "changed since you trusted it.") and the fix lines `halonic trust
  --plugin` already uses (`cli.run-connector-warning`). The words build on `plugin list`'s states
  and the approved start-refusal fixes of HAL-7941, so the team decides them (HAL-2282).
- Studio's run view shows its plain "didn't start" line for both reasons, rather than reading
  them as a missing secret (`runs.run-view.step-failed-call`). No new Studio words.

The trust check itself doesn't change: what may start, and when, is the same as before.

## Covers

- ports.connector-start-failure
- app.plugin-connector-opening
- events.tool-result-cause
- events.connector-listing-failed
- engine.tool-result-cause
- engine.connector-listing-failed
- cli.run-connector-warning
- runs.run-view.step-failed-call
