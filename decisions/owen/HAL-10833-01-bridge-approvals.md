# Decision: the run ledger hears the approvals the bridge asks for

- Approval: HAL-10833 (Liam, CTO; review points 1 and 2 of HAL-10827)
- Kind: internal
- Task: HAL-10833

The run ledger of the agent host used to show only the approvals a harness reports as events of the
run (Codex). It now also records the approvals the bridge asks Studio for, which are Claude Code's
and those for Halonic's own tools for every harness, found by the engine's run and the agent. A
bridge call that ends without a decision settles as denied. `agent-host.gateway-run-ledger` changes
by that one clause and one limit: until the host can tell Studio (the relay in HAL-10833 part 2), a
phone cannot answer an approval of the bridge, and the call is refused with a clear error. Nothing
is allowed that was not before; the answer to a phone is still never sent to the run under a wrong id.

## Covers

- agent-host.gateway-run-ledger
