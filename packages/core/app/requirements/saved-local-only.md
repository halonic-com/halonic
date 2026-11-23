# app.saved-local-only

- Status: active
- Since: unreleased
- Source: HAL-16406 (Liam's decision on HAL-16404, plan approved on HAL-16406): the CLI counts a saved Local only as the Studio does since HAL-16400 (`studio.engine-service`)

When a workspace with history starts a run from its live version, and the live version has `privacy.localOnly` off while the saved `workspace.yaml` has it on, the app shall count Local only as on for that run, before the change is made live. Turning Local only off shall still wait until it is made live. Only the flag shall change: the run's definitions, and what its trust check covers, stay as the live version has them. While the live version has Local only off, a saved `workspace.yaml` that can't be read or has an error shall refuse the run as `invalid_input`, saying Halonic can't tell whether Local only is on, and nothing shall start.

`halonic run`, `halonic runs send`, `halonic routines watch` and `halonic serve` shall read Local only this way. A watch already going shall refuse the next run, and a running run's connectors, when the saved file turns Local only on, as for a new version that turns it on.

## Examples

- Given Acme's live version has Local only off,
  when the person saves `privacy.localOnly: true` in `workspace.yaml` and runs `halonic run`,
  then the run is local only and calls no model in the cloud.
- Given Acme's live version has Local only on,
  when the person saves it off and runs `halonic run`,
  then the run is still local only, until the change is made live.
- Given Acme's live version has Local only off and the saved `workspace.yaml` has an error on line 2,
  when the person runs `halonic run`,
  then it's refused as `invalid_input`: "The saved workspace.yaml has an error on line 2, so Halonic can't tell whether Local only is on. Nothing started."
- Given `halonic routines watch` is going on Acme with Local only off,
  when the person saves Local only on,
  then the next routine run is refused with "turns local only on or off", and so is a connector start of a run that was already going.
