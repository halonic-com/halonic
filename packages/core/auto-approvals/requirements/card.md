# auto-approvals.card

- Status: active
- Since: unreleased
- Source: HAL-19479, PR 1 of HAL-19462 (design rev 2 on HAL-19416, sections 2 and 10, S3)

The auto approvals package shall build a typed card only for a pending approval of the configured workspace. The card's requester shall be the actor of the approval's `approval.created` activity entry; when that differs from `requestedByAgentId`, or there is no such entry, the card shall be `untyped` with the reason. A card shall be untouched only when the approval has no decision, the same `updatedAt` as `createdAt`, no revision request or resubmit entry and no user comment. Text an agent wrote (payload, comments, linked issue titles and descriptions) shall only ever add a block. A `tool_gateway` approval, a touched approval, an `untyped` card and an unknown approval type or source shall never be eligible.

## Examples

- Given `requestedByAgentId` agent-2 and an `approval.created` entry by agent-1, when the card is built, then it is `untyped` with `card.requester_mismatch`.
- Given a payload with `source: tool_gateway`, when the card is screened, then it is not eligible.
- Given an approval updated after it was created, when the card is screened, then it is not eligible with `card.touched`.
- Given a linked issue whose description claims a live kind, when the card is screened, then it is still `untyped` and not eligible.
