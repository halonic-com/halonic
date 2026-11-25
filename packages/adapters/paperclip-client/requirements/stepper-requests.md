# paperclip-client.stepper-requests

- Status: active
- Since: unreleased
- Source: stream HAL-17488 (the board's requirement on HAL-10, 24 Nov 13:05 UTC: "If Paperclip needs something, it ends up as a stepper in my Halonic Inbox"); architecture note on HAL-17491, sections 7.2, 7.4, 7.7 and 7.8; Liam's review of #5674; task HAL-17536

When the Paperclip provider has a stepper catalog and an open confirmation card pins a revision of its task's document `stepper-request`, the provider shall read the document at that revision, check it with `validateStepperRequest` and then with the port's allow-list for a stepper request, and serve the card as an action item: no options, the card's own text as the reason, the requester from the provider's agent and source, never from the document, and the request with what each block touches. On every list it shall read the document's latest revision again and mark the item as changed when that isn't the pinned one, so Studio shows "The request changed after this card was made" and doesn't run it. A card that pins no `stepper-request` shall stay as it was; a card whose request can't be read shall stay a normal card whose text ends with "This card has a stepper Halonic can't read: <reason>". Without a catalog the provider shall read no document.

When Studio answers such an item with an `action-result` that passes its check, the provider shall write the task's document `stepper-result`: the request revision that ran, the outcome, and per block its status, time and short result, with links for kept web addresses, "set on <date>" and no value for a block that takes a secret, and "done by hand" for a step done by hand. It shall then post one summary comment on the task and resolve the card: accepted when the stepper succeeded, rejected with the outcome otherwise. It shall refuse with `bad-answer`, before writing anything, an option to a stepper item, an `action-result` to any other card, and a step past the request's last block.

The provider's request list shall gain exactly three rows, each naming its one document key in the path: read `stepper-request` at a revision (a UUID), read `stepper-request`'s latest revision, and create or update `stepper-result` with a body of exactly a title of "Stepper result", the format `markdown`, the text and the base revision or `null`. It shall read or write no other document key, `plan` included. An update shall name the revision Paperclip gives in its conflict answer, so no other read is needed.

## Examples

- Given a card pinned to a valid `stepper-request` revision,
  when the Inbox is listed,
  then the card is an action item with no options and the touches of its three blocks.
- Given a document with a revision newer than the card's,
  when the Inbox is listed,
  then the item is marked as changed.
- Given a 20 KB document, one naming an unknown step type, or one with a field not on the format's list,
  when the Inbox is listed,
  then the card is a normal card whose text ends with the reason.
- Given a result for a request with a secret step and a step done by hand,
  when it is answered,
  then `stepper-result` says "set on 24 Nov 2026" for the secret, with no value, and "done by hand" for the other.
- Given a request to read or write the document `plan`, or to write `stepper-request`,
  when the request list is asked,
  then no row matches it.
