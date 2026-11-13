# Decision: a write tool can say "drafted"

- Approval: HAL-1301 (the Messages and Read sections plan: a draft tool says "Drafted 1 email", a send never can); the package owner (Liam) approves this note in review
- Kind: internal
- Task: HAL-1301, HAL-8238

## What changes

`events.tool-result-risk`: `ToolVerb` on `tool.result` gains `drafted`, for a `write` tool that
prepares something without sending it ("Drafted 1 email"). Older logs read as before; nothing
else on the event changes.

`format.integration-file`: a tool's `verb` in an `integration.yaml` sheet may now be `drafted`,
and only on a `write` tool. A `send` tool that uses it fails as `drafted-on-send-tool`, so a send
can't be worded as something milder. The two JSON Schema goldens (`integration.schema.json`,
`plugin.schema.json`) list the new value.

## Why

Integrations with a "create draft" tool (email, documents) were forced to say "Created" or
"Saved", which hides that nothing left the machine. Saying "Drafted" is the honest word, and
limiting it to `write` tools keeps the closed list a safety property.

## Covers

- events.tool-result-risk
- format.integration-file
- packages/core/format/spec/integration.schema.json
- packages/core/format/spec/plugin.schema.json
