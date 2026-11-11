# Decision: a connector file's `read` list, and a run log event for tools that ran without asking

- Approval: [HAL-5522](/HAL/issues/HAL-5522), the board's choice of option A; wording by Sofia on [HAL-5582](/HAL/issues/HAL-5582); Liam approves this note in review
- Kind: user-visible

The board chose to let a workspace mark safe connector tools as read-only by
name, in the connector file (HAL-5522, option A). This part adds the field,
its checks and the run log event; the engine uses them in part 2.

- `format.connector-read` (new): `tools.read` is a list of exact tool names.
  A pattern is an error, a name `tools.allow` leaves out a warning.
  `marksRead` says a tool only reads when the list names it and `approve`
  doesn't, so `approve` wins. The JSON Schema spec file
  (`spec/connector.schema.json`) gains the optional `tools.read` list.
- `events.tool-unasked` (new): a `tool.unasked` run log event, with the
  connector, the tool and `reason: "read-list"`, for a call that ran without
  asking because of the list.
- `events.run-log-contract`: lists `tool.unasked` among the events added
  since the reference. The type test gained the one name.
- `@halonicjs/app` gains `workspaceRisksOf`, which builds the
  `workspaceRisks` that `readToolListing` already takes from the same list.

No test was skipped or loosened.

## Covers

- events.run-log-contract
- packages/core/format/spec/connector.schema.json
