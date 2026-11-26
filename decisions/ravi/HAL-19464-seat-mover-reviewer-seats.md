# Decision: the seat mover's not-connected rule gets its own requirement

- Approval: the task asks for this change (https://paperclip.halonic.com/HAL/issues/HAL-19464, Julian's follow-up from his review of #6452); the reviewer signs this note in review
- Kind: internal
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:fSHrSYikqhzaLG1fcbqZzBVY+wNiNT3olSVcimc2IkXcUAxsZToBZ1lnLa9JPd+W9tavptcflxxppJeComfNCA==

Julian's review of #6452 (HAL-19394) asked for this follow-up.
`paperclip.seat-mover-spread` held two rules: spreading agents over the legal
seats, and moving agents off a seat whose AI connection isn't connected. The
second rule moves into its own requirement,
`paperclip.seat-mover-not-connected`, together with its two examples and their
tests. It now names "an explicit status other than `connected`", and a new
sentence and example say a connection with no status counts as unknown:
nobody is sent to it and nobody is moved off it. So
`paperclip.seat-mover-spread` loses two examples, one test and one expect
call; none of them is dropped, they now count for the new requirement.

`paperclip.seat-mover-spread` gains one sentence and one example: a reviewer
that shares its seat with a pinned agent is placed before the other agents
spread, so spreading doesn't take the empty seat it needs. Before this change,
in Julian's example, the reviewer was listed as stuck on every pass.

## Covers

- paperclip.seat-mover-spread
