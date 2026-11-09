# contracts.agent-placement-store

- Status: active
- Since: 0.1.0
- Source: stack 3a of the [HAL-189 implementation plan](/HAL/issues/HAL-189#document-implementation-plan), with Liam's change on HAL-1967 (each new port gets a contract suite); `AgentPlacementStore` port v1

Where an adapter implements `AgentPlacementStore`, it shall start empty; give back every field of a saved placement; replace a placement saved again for the same location and agent; remove a placement, treating the removal of a missing one as no error; keep what was saved whatever the caller later does with the objects it passed or got; keep one placement per location and agent id, compared exactly and never joined in a way that lets two keys meet; and, for a placement that can't be read, throw an error naming its location and agent from `get`, while `remove` and `save` still work.

## Examples

- Given an empty store,
  when the placement of `coder` in `/workspaces/acme` is read,
  then it is `null`.
- Given placements for agent `b/c` in `/workspaces/a` and agent `c` in `/workspaces/a/b`,
  when one is saved and the other is read,
  then the other is `null`.
- Given a saved placement for `coder` in `/workspaces/acme`,
  when `coder` in `/workspaces/acme/` or `Coder` in `/workspaces/acme` is read,
  then it is `null`.
- Given a damaged placement,
  when it is read,
  then the error names its location and agent; and when it is removed, it is gone.
