# Decision: the Paperclip provider's request list is on Liam's reviewer paths

- Approval: Liam asked for it on HAL-17467, a follow-up to the agent messaging ADR (HAL-17425); Julian signs, since Liam wrote the pull request
- Kind: internal
- Signature: ed25519:sha256:s6QbTuo7EHJ-9JxW-RnqP0pi0Jq_Jkrdog_YTzYt1lI:zSZQfL2kGw6CWOy90s3reILFknsA/siVPW7U4yzmFqgV7upWS0ISXMbwwJFxfS6sBsmcnyg0Gw/Tb8/7+Nm/Bw==

`paperclip.reviewer-paths` adds one path to Liam's:
`packages/adapters/paperclip-client/src/requests.ts`, the Paperclip provider's fixed list
of requests. The requirement gets an example for it.

## Why

The provider holds a board key, which can do everything the board can in Paperclip. A new
entry on that list widens what the key may do, so it is a change to what a run may do and
was already outside Julian's scope in words (HAL-14809 point 4). Now `reviewerFor` sends it
to Liam as well.

## Covers

- paperclip.reviewer-paths
