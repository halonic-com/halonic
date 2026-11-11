# Decision: a tool result says what one call did to its noun, and a reader says what a run sent in call order

- Approval: [HAL-2868](/HAL/issues/HAL-2868), from Sofia's wording call on [HAL-2848](/HAL/issues/HAL-2848) (a team decision); the package owner (Liam) approves this note in review
- Kind: internal
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:gVJg0wF97wtDIOqikVjBTgxcFk5TH78Vep08gq8wBdAXBdUNlhZcg2MKVx5/5leGV1ed60dJpaLXUbMCmwcKDg==
- Task: HAL-2868, a follow-up to [HAL-2831](/HAL/issues/HAL-2831) and [HAL-2836](/HAL/issues/HAL-2836)

## What changes

`tool.result` gains one more optional field under `events.tool-result-risk`: `verb`, one of
`sent`, `saved`, `created`, `updated` and `moved`. It is copied from the tool's integration sheet
with `noun` when the call ends. A missing `verb` means `sent`, so logs written before it, and
sheets without one, read as before. The requirement gains the rule, a rule that a call without
`outcome` is neither sent nor "may have sent", and two examples.

`events.run-log-contract`: its third example listed twenty-two fields that come with the engine. It
now lists twenty-three, with `tool.result.verb`, which is optional and covered by `events.tool-result-risk`.
No reference field changes. The type test that pins the exact `tool.result` shape gains the field.

`events.upgrade-old-run-logs`: its example for logs written before `risk` and `noun` now names
`verb` too, and the old-log test checks that no `verb` is added.

A new requirement, `events.summary-sends`, covers `sendsOf`. It reads a run's log and gives what the
run sent and what it may have sent, as one group per verb, in the order of each verb's first
call, with one count per noun inside a group, in the order of each noun's first call. It also says
whether the run made a tool call at all, for the "Sent nothing" rule.

## Why

The run line always said "Sent", so Drive's tools read "Sent 1 file" when the file only went to
the user's own Drive. Sofia flagged that as an honesty problem. The verb is a closed list rather
than free text: the run line is the user's record of what left their machine, and a sheet from
any publisher shouldn't be able to word a send as something milder. Adding a verb takes a
reviewed change here and in the format.

The reader lives in the events package next to `summarize`, so the `halonic run` receipt and the
runs list say the same thing about a run. Grouping by verb gives Sofia's "Sent 1 email, 2 invites"
and, with a verb, one phrase per verb: "sent 1 email, 2 invites · saved 1 file".

No test was weakened or removed.

## Covers

- events.tool-result-risk
- events.run-log-contract
- events.upgrade-old-run-logs
- packages/core/events/src/run-event.test.ts
- packages/core/events/src/run-event-fields.test.ts
- packages/core/events/src/old-run-log.test.ts
