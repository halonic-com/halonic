# Decision: Julian's line limit goes to 1500, with an 800-line limit in the kernel and event types

- Approval: Liam decided it on HAL-18459 (25 Nov); Julian's scope is Liam's call under HAL-14809
- Kind: internal
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:HzyA751VxVGmpofIjY52OWDEcz9uToqtwyLHMXX6uGpV9bvnOrrhTlqQ2nztPqsCaZSxDA4QB72UaqlMWC5NCQ==

`paperclip.reviewer-paths` names Julian for a pull request of up to 1500 changed lines
instead of 1200. Tests, Markdown and wording files (the CLI's `messages/`, `*-words.ts`)
don't count toward it, so a pull request of only those still has no limit. A pull request
with more than 800 changed lines of code in `packages/core/engine/src/kernel/` or
`packages/core/events/` goes to Liam at any size. When a caller doesn't pass each file's
lines, the whole pull request's lines count, which can only send more to Liam. Liam's
paths, the sensitive words, security and release pull requests and the run-permission
rule don't change.

## Why

Many pull requests between 1200 and 1500 lines touch none of Liam's paths and wait for
Liam only because of their size, or because their tests push them over the limit. The
kernel and the event types are what every run depends on, so big changes there stay with
Liam.

## Covers

- paperclip.reviewer-paths
- tooling/paperclip/src/reviewer-paths.test.ts
- tooling/paperclip/src/routing.test.ts
