# Decision: the merge controller's follow-up to #5723

- Task: HAL-17762
- Approval: https://paperclip.halonic.com/HAL/issues/HAL-17762 (Liam's decisions from his review of #5723 on HAL-17703; Liam approves this note in review)
- Kind: internal
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:2PWrVXB5YkRzvme/+M5JwwhFUwvfupD06XIT6JzPvY7a+ZR/dA7pH+3rMs4MdFvnoBrJ1TAIxgwToUxvyEr0Bg==

Five merge-control requirements change, as Liam decided in his review of #5723:

- `paperclip.merge-control-capacity`: while `main` is red, the fix pull request of the freeze jumps even when runner capacity is short or unknown. It keeps its cost and is logged as `JUMP_SHORT`. Every other jump still waits for capacity. This departs from the board's 17:47 wording "no jump when capacity is short"; Chief lists it under "Decided by the team", and the ADR on #5719 says the same.
- `paperclip.merge-control-cost`: a group that several actions of one pass cancel counts once, on the first. Removals run front of the queue first.
- `paperclip.merge-control-fill-order` and `paperclip.merge-control-fast-track`: fast-track goes first whatever the board's boost. It used to be a 50,000 bonus, which a larger boost could outrank.
- `paperclip.merge-control-pure`: the purity check also follows `export … from` and side-effect `import "…"` lines.

No test was weakened. The purity test makes fewer `expect` calls (10 instead of 24) because it now checks the whole module list in one comparison (`impure(…)` must equal `[]`) instead of one `expect` per module. It reads the same modules plus the ones it now follows, and a new test proves it catches an I/O module reached through `export * from` or `import "…"`.

## Covers

- paperclip.merge-control-capacity
- paperclip.merge-control-cost
- paperclip.merge-control-fast-track
- paperclip.merge-control-fill-order
- paperclip.merge-control-pure
