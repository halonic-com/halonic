# A new port holds the instructions a person trusted for each agent

- **Status:** Accepted
- **Date:** 2026-11-15

## Context

A harness run starts with the agent's `AGENTS.md` and its skills, copied into
the run's own folder and pinned by hash (HAL-3106). When that text changes, a
person must be asked again before the run starts, so something has to keep the
pin they trusted. Two stores exist already. `TrustStore` is keyed by a
source's location and holds program content, so its shape is wrong.
`AgentPlacementStore` holds one record per agent, but only for an agent a
person took out of its sandbox, and "no record means sandbox" is the safe
default the threat model relies on. Instruction trust applies to every run,
sandboxed or not. Putting the pin in the placement record would mean either
making `runsOn` optional, which weakens that default, or creating records for
sandboxed agents. Adding a field would also break `isAgentPlacementFor`, a
check on a security port.

## Decision

**`InstructionTrustStore` is a new port, version 1,** in `core/ports`. A
record is the key (`location`, `agent`), the `pin` and `grantedAt`. It has
`get`, `save` and `remove`, as `AgentPlacementStore` does, and
`isInstructionTrustFor` checks what an adapter reads: exact fields, the key
asked for, and every digest in `sha256:` form.

**The store lives in the user's profile, never in a workspace,** and only a
person writes it. No tool the model can call reaches it.

**It fails closed.** No record, a record that can't be read, or any
difference from the trusted pin means a person is asked. Where nobody can
answer (headless `serve`, CI, a routine) the engine refuses to start the
harness, naming the files added, removed and changed. A run never starts on an
old trust.

**The types and the comparison live in core.** `InstructionPin` and
`InstructionChanges` are in the port file, and the pure `instructionTrust`
function is in `core/app`. `harness-kit` imports them from core and keeps
`pinInstructions` and `copyInstructions`, which need `node:crypto` and the
disk.

## Consequences

Instruction trust is separate from placement, so the placement default stays
as it is. Each adapter passes a shared contract suite. The desktop app has no
`fs-tauri` adapter for this store yet, as for `AgentPlacementStore`: it needs
one before it runs harnesses, tracked in a follow-up task.
