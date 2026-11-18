# Decision: a phone decides the Studio's bridge approvals through the engine

- Approval: https://paperclip.halonic.com/HAL/issues/HAL-10849 (board's yes on HAL-11378: the Studio runs harness agents in 0.1)
- Kind: user-visible
- Task: HAL-10849

`studio.engine-service` changes in one place: a phone's decision on a question Claude Code asks
through its bridge now reaches the engine. The agent host passes it on, marked `remote-device`,
and the Studio gives it to the engine's remote decisions of that run
(`LocalExecutor.bridgeRemoteDecisions`, merged in #3241). That is the same path as a card click,
so the first answer, from the card or the phone, wins, and a later one is `already-decided`.

Before this, the Studio gave the bridge no remote decisions, so the agent host's client refused
every phone decision. It still does before the engine is built, and for a run with none, so
nothing is approved by default.

No test is weakened or removed. New tests cover the phone's decision reaching the run, being
refused without one, and the engine's own remote decisions answering `unknown` when no question waits.

## Covers

- studio.engine-service
