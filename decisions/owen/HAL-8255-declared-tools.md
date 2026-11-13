# Decision: the logged risk is the higher of the listing's and the sheet's

- Requirement: `engine.turn-logs-risk` (`packages/core/engine/requirements/turn-logs-risk.md`)
- Task: HAL-8255, reviewed on HAL-8258
- Approval: Liam's decision on HAL-8255 (https://github.com/halonic-com/halonic/pull/2398 carries it)
- Kind: internal
- Signature: PENDING

## What changes

When the engine writes the `tool.result` of a call to a server's tool, it copies the higher of
the listing's `risk` and the `risk` the connector's sheet declares for that tool. It leaves
`risk` out only when neither gives one, and for Halonic's own tools. Before, only the listing
counted. The requirement and its third example say so, and point to `engine.turn-declared-tools`.

## Why

A sheet can declare a tool's noun, verb and risk, and a server's own listing is not trusted for
the noun and verb. If the listing under-states a risk, the log should still show what the sheet
declares, so readers do not count a sending call as harmless.

## Tests

No test was weakened. The risk tests in `src/agent` and `connector-calls` still pass, and new
tests cover the sheet's risk, the higher-of rule and a hostile listing.

## Covers

- engine.turn-logs-risk
