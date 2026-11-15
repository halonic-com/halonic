# contracts.instruction-trust-store

- Status: active
- Since: 0.1.0
- Source: HAL-3106 slice 3b, with Liam's change on HAL-1967 (each new port gets a contract suite); `InstructionTrustStore` port v1

Where an adapter implements `InstructionTrustStore`, it shall start empty; give back every field of a saved record, including a pin with no files; replace a record saved again for the same location and agent; remove a record, treating the removal of a missing one as no error; keep what was saved whatever the caller later does with the objects it passed or got; keep one record per location and agent id, compared exactly and never joined in a way that lets two keys meet; and, for a record that can't be read, throw an error naming its location and agent from `get`, never return `null`, while `remove` and `save` still work.

## Examples

- Given an empty store,
  when the record of `coder` in `/workspaces/acme` is read,
  then it is `null`.
- Given records for agent `b/c` in `/workspaces/a` and agent `c` in `/workspaces/a/b`,
  when one is saved and the other is read,
  then the other is `null`.
- Given a saved record for `coder` in `/workspaces/acme`,
  when `coder` in `/workspaces/acme/` or `Coder` in `/workspaces/acme` is read,
  then it is `null`.
- Given a damaged record,
  when it is read,
  then the error names its location and agent; and when it is removed, it is gone.
