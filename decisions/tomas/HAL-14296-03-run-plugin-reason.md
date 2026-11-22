# Decision: a run says why a plugin connector gave no tools

- Approval: Paperclip task HAL-14296 (from Nina's C340 check on HAL-14271, rows 20–23, code row C13+; a team decision by Liam on the approved C336/C337 wording); Liam approves this note in review
- Kind: user-visible

A plugin connector whose plugin wasn't added, was off, had changed or couldn't start its sandbox
gave `halonic run` the same plain warning since HAL-13670: "couldn't list its tools", with no
reason. Now:

- The engine reads a plugin's backend with no sandbox (`PluginBackendNotFencedError`) as a new
  start cause, `sandbox-not-ready`, with no name; the gate's own reason stays out of the log, as
  the error's text always has. Older readers read the new `why` as no cause, as the reader does
  for any value it doesn't know.
- `halonic run` warns "! orders didn't start, so its tools are off in this run." with, under it,
  "The sandbox its plugin runs in can't start on this computer." and "See why with halonic
  doctor.".
- For the cause `other`, `halonic run` reads the profile's plugins once, before the run, and only
  when a connector uses one, and gives the lines `tools review` gives (#4199): not added (with
  "Did you mean"), or can't be read. A plugin that is on keeps the plain warning.
- A plugin that isn't trusted or changed since is left to Owen's causes `plugin-not-trusted` and
  `plugin-changed` (HAL-14974, #4461), which this builds on, so those cases keep one wording and
  one path. The cause reader's walk through `cause` from that PR also finds a wrapped
  `PluginBackendNotFencedError`.

The active requirements `ports.connector-start-failure`, `events.tool-result-cause`,
`events.connector-listing-failed`, `engine.connector-listing-failed` and
`engine.tool-result-cause` gain `sandbox-not-ready`; `cli.run-plugin-connector-warning` is new.
No test was weakened or skipped: the existing warning tests pass with the connector's file as
before.

## Covers

- ports.connector-start-failure
- events.tool-result-cause
- events.connector-listing-failed
- engine.connector-listing-failed
- engine.tool-result-cause
- cli.run-plugin-connector-warning
