# engine.connector-listing-failed

- Status: active
- Since: unreleased
- Source: HAL-13670 (from Nina's C207 note on HAL-13667: a run whose connector's program was missing ended "✓" and its log said only that a tool wasn't offered); the plugin reasons from HAL-14974 (Kim's C522 finding on HAL-14972: a run with a plugin added but not trusted warned only "couldn't list its tools")

When a connector an agent's file lists can't list its tools at the start of a model turn of a run, the engine shall leave its tools out of the turn as before, go on with the turn, and write a `connector.listing-failed` event (`events.connector-listing-failed`) with the agent and the connector's id, whose cause is `connector-not-started` with `why: "program-missing"`, `"secret-not-set"`, `"plugin-not-trusted"` or `"plugin-changed"` and the program's or the secret's name or the plugin's id, cut to `maxCauseNameLength`, when the error is one `connectorStartFailureOf` reads (`ports.connector-start-failure`), and `why: "other"` with no name otherwise, as a `tool.result` gives it (`engine.tool-result-cause`). The event shall never hold any part of the error's message. A turn with no run log, such as a chat turn, shall write nothing.

## Examples

- Given a run whose writer lists `handbook-files`, whose program `npx-nope` isn't on this computer,
  when the writer's turn starts,
  then the log has `connector.listing-failed` with agent `writer`, connector `handbook-files` and `cause: { code: "connector-not-started", why: "program-missing", name: "npx-nope" }`, and the run completes.
- Given a run whose writer lists a connector from the plugin `files`, which is added but not trusted yet,
  when the writer's turn starts,
  then the log's `connector.listing-failed` has `cause: { code: "connector-not-started", why: "plugin-not-trusted", name: "files" }`.
- Given a connector whose listing fails with an error that names a secret's value,
  when the turn starts,
  then the event's cause is `why: "other"` with no name, and the value appears nowhere in the log.
