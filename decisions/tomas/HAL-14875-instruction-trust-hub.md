# Decision: an agent's trusted instructions are kept by its hub and id

- Task: HAL-14875
- Approval: Liam asked for this change in his review of #4301 on HAL-13062, as the task HAL-14875 (https://paperclip.halonic.com/HAL/issues/HAL-14875), and reviews and signs it there. A team decision with no board card (HAL-2282 rule).
- Kind: user-visible

## What changes

The key of a trusted instruction pin was the workspace and the bare agent id. Two hubs in one
workspace that each have an agent `coder` shared one pin, so trusting `support/coder` replaced
the pin of `sales/coder`, and the next run of `sales/coder` was refused again. It failed closed,
but the two agents kept un-trusting each other.

The key is now the workspace and the agent's hub and id, as `support/coder`, made in one place
(`instructionTrustKey` in `@halonicjs/ports`). The engine's check, `halonic trust instructions`,
`halonic run`'s question and Studio's **Review instructions** all use it. The stored record keeps
its shape, so the port, its adapters and the desktop shell don't change.

A pin saved under the bare id matches no key now, so it counts as not trusted: a person is asked
once more for each agent they trusted before, and nothing is trusted by accident.

## Requirements

- `engine.harness-instructions-trust`: the check's key holds the run's hub; a new example.
- `ports.instruction-trust-store`: records are by the agent's hub and id; `instructionTrustKey`
  is exported; a new example.
- `cli.commands.trust.instructions`: the pin is saved under the hub and id; a new example with
  two hubs.
- `runs.run-view.instructions-refusal`: **Review instructions** asks with the run's hub.
- `studio.workspace-instruction-trust`: the pin is saved for the agent in its hub.

No test is weakened or removed: the changed tests now expect the hub in the key, and the
engine, ports and CLI requirements each get a new test with two hubs.

## Covers

- engine.harness-instructions-trust
- ports.instruction-trust-store
- cli.commands.trust.instructions
- runs.run-view.instructions-refusal
- studio.workspace-instruction-trust
