# paperclip-client.verdict-reason

- Status: active
- Since: unreleased
- Source: HAL-20649 (found for HAL-19002: no item of a verdict card could be rejected); plan approved by Liam; builds on paperclip-client.card-kinds

When the Paperclip provider maps a `request_item_verdicts` card, each verdict option the card lists in `requireReasonOn` (reject when it lists none) shall need a note (`noteRequired`), so apps ask for the reason the provider sends as that item's `reason`. A `reject` option that needs one shall be labelled "Why are you rejecting this?", the label of a Reject button's note; any other verdict that needs one shall have no note label of its own.

## Examples

- Given a pending verdict card with approve, reject and defer and no `requireReasonOn`,
  when the inbox is read,
  then each item's Reject option needs a note labelled "Why are you rejecting this?", and Approve and Defer need none.
- Given the same card with `requireReasonOn: ["defer"]`,
  when the inbox is read,
  then each item's Defer option needs a note with no label of its own, and Reject needs none.
