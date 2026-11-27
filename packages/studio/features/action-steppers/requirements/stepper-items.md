# action-steppers.stepper-items

- Status: active
- Since: unreleased
- Source: HAL-18517 (approvals stream HAL-17488), plan approved on HAL-20453; run and block result HAL-20455; architecture note on HAL-17491, sections 1.1, 7.2 and 7.4

When the user opens an Inbox item that carries a stored stepper request whose document is one `use` block, the stepper shall open it as that block's reviewed stepper with the block's parameters, checked as in `action-steppers.review-mode`, and shall count its expiry from when the item was made, 24 hours later. The stepper shall run such a request as it runs any action item, and shall answer the item for its one block, numbered 1: failed as its first failed step failed; else succeeded with every step's kept fields, "done by hand" when the user did any step by hand; or skipped when every step was skipped. If the request is declined or expires, or the user stops the run part-way with no failed step, the answer shall list no block. If the document has several blocks or a block that isn't `use`, the item shall say "this version of Halonic opens only a request for one whole stepper". If the one block is a `server-session` block, the stepper shall leave the item to `inbox.run-with-claude`. If the document has a newer revision than the item pins, the item shall say "it changed after the agent made this card". If the document can't be parsed as a request, the item shall say "its request document can't be read". The stepper shall leave the item's `kind` as the provider set it.

## Examples

- Given a Paperclip card made on 25 Nov 2026 at 09:00 UTC, pinning a request of one `use` block for `github.approve-deployment@1` on the invented repository `acme/app`,
  when the user opens it,
  then the stepper shows "Approve a deployment" for review, expiring on 26 Nov 2026 at 09:00 UTC.
- Given a card pinning a request of one `use` block for `github.upload-social-preview@1` on `acme/app`,
  when the user uploads the image on the settings page and marks the step done in the desktop app,
  then the item is answered `succeeded` with block 1 "done by hand".
- Given the same card opened on 26 Nov 2026 at 09:01 UTC,
  when the user opens it,
  then the stepper says the request has expired.
- Given a card pinning a request of two `use` blocks,
  when the user opens it,
  then the card says "this version of Halonic opens only a request for one whole stepper" and offers only **Decline**.
