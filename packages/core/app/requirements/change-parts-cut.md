# app.change-parts-cut

- Status: active
- Since: 0.1.0
- Source: HAL-3278; Changes design 8, the v0.1 cut, widened to routines' fields (HAL-3267 engine answer 5)

The describers for workflows, agents and routines shall give parts for every line they describe; for any other kind, `describeItemChange` shall give one line without parts, "Changed", "New" or "Deleted", and callers shall offer per-file and per-line-part actions instead.

## Examples

- Given a workflow, an agent or a routine changed, then every line has at least one part.
- Given hub `finance` was renamed "Finance team", then its one line is "Changed" with no parts, and the developer view offers Discard and "Discard this part" on the line diff instead of Undo this change.
- Given an item of another kind is new or deleted, then its one line is "New" or "Deleted".
