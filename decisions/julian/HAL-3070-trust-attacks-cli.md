# Decision: the `routines watch` expect count may drop on the trust-attacks pull request

- Task: HAL-3070
- Approval: Liam approves this note in review of [HAL-3070](/HAL/issues/HAL-3070)
- Kind: internal
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:u7ZE2r0si2xYlZ1Xq+5fLMqo9Pv/32fXByQYODNlnJYpYAfN1xmZ3svWo2dwzbjr0lECtZbk6EG4WZPHn2yiAg==

## What changes

Nothing in `cli.commands.routines.watch` changes. This pull request only adds
`apps/cli/src/trust-attacks.test.ts` and its requirement `cli.trust-attacks`. Because it
changes a file in `apps/cli`, the requirement guard counts the `expect` calls of every
`apps/cli` requirement, and `cli.commands.routines.watch` made fewer of them than on the
merge base (230 against 251, then 228 against 247 on the next push).

## Why

Those tests check through `vi.waitFor`, which runs its `expect` again on every retry, so the
count depends on how fast the runner is. The merge base's own count moved by 4 between two
runs with no change, and [HAL-5568](/HAL/issues/HAL-5568) already records the same drift
(221 against 232). No test, helper or fixture of the watch was touched, and no watch test was
skipped or removed.

## Covers

- cli.commands.routines.watch
