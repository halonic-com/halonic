# Decision: an On this computer refusal names halonic run, as Settings and the Harness page do

- Task: HAL-15948
- Approval: https://paperclip.halonic.com/HAL/issues/HAL-15948 (a team decision with no board card, HAL-2282 rule: wording on the approved sandbox-not-ready banner, from Iris's flow check C656 on HAL-15937, finding 2, using Sofia's line from HAL-13232)
- Kind: user-visible
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:czzmgX9BcbrMmz4J8EbxdosypGTu3peug/aqWY1wKEuqI4QFFJS87jgxbtQ9NwRFrTCboPnVWBjR6cttzGHvBQ==

## What changes

The `not-offered` reason in the one catalogue, and the CLI's copies of it (the run's refusal and
`halonic doctor`'s Sandbox line), now read "Studio can't start Claude Code or Codex agents
outside the sandbox; halonic run and halonic serve on this computer can." instead of "…; halonic
serve on this computer can.". The run page's banner and the Studio's own refusal say the same.
The fix after it ("Set this agent back to In a sandbox on its Harness page.") is unchanged.

`studio.engine-service` quotes the new half of the line, and the unreleased changeset from #4768
says it too.

No test is weakened or deleted; the existing tests now check the new line.

## Why

The refusal sent people only to `halonic serve`, but the served Studio has no Agents, Workflows
or Run page, so it can't start the agent the person was trying to run; `halonic run` can. HAL-15584
meant to copy the line Settings, the Harness page and `docs/security/sandbox.md` already use
("halonic run and halonic serve on this computer can"), and dropped its first half. Now one wording
holds everywhere. The first half of each line stays as Sofia decided it on C595: "it this way"
on the Harness page, "agents" under Settings' Select, and "Claude Code or Codex agents" in a
refusal, which names no single agent's page.

## Covers

- app.sandbox-start-words
- cli.messages
- studio.engine-service
