# Decision: the Studio runs agents in a harness through the agent host

- Approval: https://paperclip.halonic.com/HAL/issues/HAL-10849 (board's yes on HAL-11378: the Studio runs harness agents in 0.1)
- Kind: user-visible
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:qbcG5n1Eoyq/6od1O8eG8ZCkGJvFEcsA8k4QXpn9Q7MhQk1EFTtUR7y2IUl6SDEb1kGzVNPsp8Q72PVsqPrJBw==
- Task: HAL-10849

`studio.engine-service` said the page refuses every workflow with an agent in a harness, because
the page couldn't start one. The board decided on HAL-11378 that the Studio runs harness agents in
0.1, so the requirement changes:

- Where the agent host runs, an agent in a harness runs in the agent host's fenced sandbox, with
  its harnesses, bridges, profile builder, proposal folders and placement choices. Each bridge's
  approvals are the engine's own approvals for that run, so a card decides them. Nothing is
  approved by default: before the engine is built, or with no approvals for the run, every request
  is refused.
- An agent set to "On this computer" is refused before its program starts, because the agent host
  has no unfenced session yet. That fails closed.
- Where no agent host runs, a workflow with an agent in a harness is still refused as
  `unavailable`. A workflow with an agent that lists a connector is still refused everywhere.
- Where the agent host can't be reached when the engine opens, the engine opens without harnesses
  so the other workflows still run, and a harness run fails at its harness step.

No test is weakened or removed. The refusal tests still hold, now for a Studio without an agent
host, and new tests cover the agent host case.

## Covers

- studio.engine-service
