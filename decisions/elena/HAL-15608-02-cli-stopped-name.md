# Decision: a run says which plugin's sandbox didn't work when it started, by the plugin's name

- Approval: HAL-15608 (Paperclip task), from flow check C600 #4 on HAL-15594; lines in the shape of the approved plugin lines of `halonic run` and the step panel (HAL-14974, HAL-15278), words decided by the team with Sofia (HAL-15616) under HAL-2282; the reviewer signs this note with the pull request
- Kind: user-visible
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:mZbc552S55DfN/ci5pZZQ3ZbEVZ90vjmuGtRKE7AKOy8/cliTrs8KbJOLqK5QVwt6Ziytblfx9EUc9xbR37CBw==
- Task: HAL-15608

## What changes

A plugin's backend opens when a turn lists the connector's tools. When its sandbox didn't work when it started, the
listing failed with `PluginBackendStoppedError`, which nothing read, so `halonic run` warned only "! weather couldn't
list its tools" with a `tools review` hint, and Studio's step panel said only "Couldn't list the tools from weather.".

- `PluginBackendStoppedError` also carries the plugin's name in `pluginName`, and its message names the plugin by it,
  as `plugin list` does: "Halonic stopped the plugin Weather: the sandbox didn't work when the plugin started, so none
  of it ran. Halonic tries Weather in the sandbox again the next time a run uses it." (`cli.plugin-backend-stopped`;
  #4775's C599 words with Sofia's two edits, "when" and "none of it").
- `connectorStartFailureOf` reads it as `plugin-stopped` with that name (`ports.connector-start-failure`); the run log's
  `connector-not-started` cause gets `why: "plugin-stopped"` with the name in `name` (`events.tool-result-cause`,
  `events.connector-listing-failed`, `engine.tool-result-cause`, `engine.connector-listing-failed`). An older reader
  reads the new `why` as no cause, as it reads any cause it doesn't know.
- `halonic run` warns "! weather didn't start, so its tools are off in this run." with "The sandbox didn't work when
  the plugin Weather started, so none of it ran." and "Halonic tries Weather in the sandbox again the next time a run
  uses it." under it (`cli.run-connector-warning`).
- The step panel says "Didn't work: the connector *weather* didn't start. The sandbox didn't work when its plugin
  *Weather* started." under a call, and "Couldn't list the tools from *weather*: the sandbox didn't work when its
  plugin *Weather* started." above the calls (`runs.run-view.step-failed-call`,
  `runs.run-view.step-connector-not-started`).

Words: Sofia on HAL-15616. "when", since "as the plugin started" can read as "because"; "none of it ran", since
these lines show inside a run that goes on, where "nothing ran" could read as the whole run.

The name, not the id: these lines need no command, since the next run tries the sandbox again by itself; the
not-trusted lines keep the id because their fix is `halonic trust --plugin <id>`.

No test was weakened or skipped: each package's test gets the new cause next to the plugin causes it already checks.

## Covers

- cli.plugin-backend-stopped
- ports.connector-start-failure
- events.tool-result-cause
- events.connector-listing-failed
- engine.tool-result-cause
- engine.connector-listing-failed
- cli.run-connector-warning
- runs.run-view.step-failed-call
- runs.run-view.step-connector-not-started
- app.failed-call-line
