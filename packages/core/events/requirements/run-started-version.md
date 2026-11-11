# events.run-started-version

- Status: active
- Since: 0.1.0
- Source: HAL-5173, step 6a of HAL-3246 (save model 2.2–2.3; `runs.run-view.live-or-saved` in req-runs)

The events package shall let a `run.started` event name, in an optional `version`, which version of the workspace the run read: `{ reads: "live-version", commit, versionDate }` for the live version, where `versionDate` is the ISO date that version was made, or `{ reads: "saved-files" }` for the files as saved, so a run view can say whether a run ran the live version of a date or the saved files. A `run.started` without `version`, as older logs have it, shall read as before, and means the version wasn't recorded, not that the run read the saved files.

## Examples

- Given a `run.started` event with `version: { reads: "live-version", commit: "4f2a…", versionDate: "2026-11-10T09:42:00+01:00" }`,
  when its type is checked,
  then it is a valid run event.
- Given a `run.started` event with `version: { reads: "saved-files" }`,
  when its type is checked,
  then it is a valid run event.
- Given a `run.started` event without `version`,
  when its type is checked,
  then it is a valid run event.
