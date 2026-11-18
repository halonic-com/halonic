# Decision: the empty Runs list in the Acme sample points to the Inbox, as Home does

- Task: HAL-12225
- Approval: team decision under the HAL-2282 rule for small wording on an approved screen; Liam reviews the pull request on HAL-12225 and signs this note
- Kind: user-visible
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:ojGpA700ZaJ2LnC6WH0LLuvmQ6kLfDSzXYowbxjOR7VFexsIj76kSbLDxZamgr6nfmxkZaDZ36pGM0G/Se+JBg==

## What changes

In the Acme sample, the empty Runs list says "No runs yet" and "Start one from the Inbox, and it shows up here.", with no command line. Every other workspace keeps the command line sentence.

The `runs.list` requirement gains that clause and one example. No test was weakened or skipped.

## Why

A walk of the Acme sample (HAL-12220) found Home's Recent runs saying "Start one from the Inbox" (HAL-11115) while the Runs list said "Runs started from the command line show up here. To start one, type `halonic run weekly-report` in a terminal." A new user read two ways to start a run, and the Runs list made it sound as if Studio can't start one. Both places now say the same, with the line Home already uses.

## Covers

- runs.list
