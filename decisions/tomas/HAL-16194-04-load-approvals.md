# Decision: the board check may list approvals, and the guard test says so

- Approval: Liam reviews the board check's team-load and approvals parts and signs this note as the CTO
- Kind: internal

Part (d) of the board check (phase 1b, HAL-16194) lists new pending
approvals, read directly with `approvals.list` (the `approvals.read`
permission Liam reviewed on #5127). The guard test "never touches a call
outside its allowlist" checked that the board check can't reach
`ctx.approvals` at all. It now checks that `approvals.decide` throws: the
fake context offers `approvals.list` alone, so deciding an approval is
still caught the moment the code reaches for it. Nothing else the test
checks changes.

## Covers

- tooling/paperclip/src/plugin/board-check.test.ts
