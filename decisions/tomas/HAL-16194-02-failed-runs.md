# Decision: the PR tools test also expects the board tools

- Approval: Liam reviews the board check's failed-runs part and signs this note as the CTO
- Kind: internal
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:aMSq310ZzsmP9WmzuhWeXTFWbsd2f0FThZURhsYc/9ZVhlrJjASg6NB3lx9UZ3KEzMsff0XVlmP2CUIIMjRDBg==

The board check's read tools `board_asks` and `failed_runs` (phase 1b,
HAL-16194) are declared in the Agent tools plugin's manifest next to
`pr_status`, `my_prs` and `queue_state`. The `paperclip.pr-tools` test
compared the whole list of declared tools with those three, so it now lists
all five. It
still checks that the worker registers `pr_status` and that it answers
without a token with an error; nothing it checked is dropped.

## Covers

- tooling/paperclip/src/plugin/tools.test.ts
