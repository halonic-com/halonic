# auto-approvals.card

- Status: active
- Since: unreleased
- Source: HAL-19416 (design rev 2, section 2), HAL-19417 (threat model), HAL-19479

When Studio reads a pending board approval in shadow mode, the auto approvals package shall build a typed card from facts written by Paperclip, and shall let claims written by an agent only block. The package shall take the requester from the `approval.created` activity entry and mark the card `untyped` when `requestedByAgentId` differs from it. The package shall never find an approval with `payload.source: tool_gateway` eligible. The package shall find an approval not eligible once it was decided, edited, resubmitted, sent back or commented on by a user.

## Examples

- Given `requestedByAgentId` "agent-b" and an `approval.created` entry by "agent-a",
  then the card's kind is `untyped` and it lists `requester_mismatch`.
- Given a `tool_gateway` payload and an empty never-list,
  then the card is not eligible with `card.tool_gateway`.
- Given an approval whose payload was resubmitted after creation,
  then the card is not eligible with `card.touched`.
- Given a linked issue whose description says it is pre-approved,
  then the card stays not eligible for its own reason.
- Given a linked issue whose description holds "ｓｅｃｒｅｔ",
  then the card is not eligible with `never_list.keyword`.
