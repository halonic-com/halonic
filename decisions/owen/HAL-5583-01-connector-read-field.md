# Decision: a connector file's `read` list, and a run log event for tools that ran without asking

- Approval: HAL-5522, the board's choice of option A; wording by Sofia on HAL-5582; Liam approved this note in review on HAL-5616
- Kind: internal
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:FEnwoCx1R/6X5VZqWCFboS7v3gzfRIyoQdobNIYA4wnrTvAVkOvvel5G84Y2JfAs/G0e8vWJwabopm71SN01CQ==

The board chose to let a workspace mark safe connector tools as read-only by
name, in the connector file (HAL-5522, option A). This part adds the field,
its checks and the run log event; the engine uses them in part 2.
The note is `internal` and signed with the CTO key because no user key is
pinned yet (HAL-3434); the change itself is the board's decision above.

- `format.connector-read` (new): `tools.read` is a list of exact tool names.
  A pattern is an error, a name `tools.allow` leaves out a warning.
  A name that breaks the listed-tool name rule (1 to 64 ASCII letters,
  digits, `_` or `-`) is an error too, so a look-alike letter, a space or
  an invisible character can't pass review (HAL-5673). The rule moved to
  `@halonicjs/ports` so format and app share one copy. A tool whose
  listing says `send` stays `send`; the list can't lower it.
  `marksRead` says a tool only reads when the list names it and `approve`
  doesn't, so `approve` wins. The JSON Schema spec file
  (`spec/connector.schema.json`) gains the optional `tools.read` list.
- `events.tool-unasked` (new): a `tool.unasked` run log event, with the
  connector, the tool and `reason: "read-list"`, for a call that ran without
  asking because of the list.
- `events.run-log-contract`: lists `tool.unasked` among the events added
  since the reference. The type test gained the one name.
- `ports.untrusted-tool-listings`: says a listed tool whose listing says
  `send` counts as `send` and the workspace can't lower it, with an example
  for it (HAL-5673).
- `@halonicjs/app` gains `workspaceRisksOf`, which builds the
  `workspaceRisks` that `readToolListing` already takes from the same list.

No test was skipped or loosened.

## Covers

- events.run-log-contract
- ports.untrusted-tool-listings
- packages/core/format/spec/connector.schema.json
