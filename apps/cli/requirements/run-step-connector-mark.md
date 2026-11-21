# cli.run-step-connector-mark

- Status: active
- Since: unreleased
- Source: HAL-13670 (Nina's C337 note on HAL-14257, row C13: a step whose agent's connector didn't start showed ✓, so the user saw an answer written without the tools they set up)

When the `halonic` command shows a run's steps (`cli.run-view`), a step that ended while one of its connectors hadn't started (`app.run-step-connectors`) shall be marked "!" instead of "✓", in `halonic run` and in `halonic runs show` alike. A step that failed shall keep its "✕", and a step still running its "◌". What the connector's warning says stays with `cli.run-connector-warning`.

## Examples

- Given an Acme run whose step Read the email logged `connector.listing-failed` for `handbook`, then finished,
  when its steps are shown,
  then they read "! Read the email Writer · smart 1 s" and "✓ Draft a reply Writer · smart 9 s".
- Given an Acme run that failed in Read the email after its connector `handbook` didn't start,
  when its steps are shown,
  then the line reads "✕ Read the email Writer · smart 1 s".
