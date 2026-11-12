# Decision: the security reviewer's key becomes the second guardian

- Approval: the board approved the two-guardian design on HAL-1337 on 12 Nov, including this bootstrap step; Liam signs as the one guardian the base branch pins
- Kind: internal

`tooling/check/approvers.json` gets an explicit `guardians` list: the CTO's key (unchanged) and the security reviewer's Paperclip agent key. Nothing else changes: the `internal` list is the same and `user-visible` stays empty.

The base branch has no `guardians` list, so its guardians are the `internal` keys, which is one. The threshold is two but never more than the guardians pinned, so this one change passes on the CTO's signature alone. Once it merges, two guardians are pinned, every change to a trust root (this list included) needs both signatures, and the threshold can't be lowered again, because lowering it is a change to the list.

The new key is a public key only. Neither private key is in the repository.

## Covers

- tooling/check/
- tooling/check/approvers.json
