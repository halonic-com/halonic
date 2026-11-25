# paperclip-client.decisions

- Status: active
- Since: unreleased
- Source: board ask on HAL-18861 (every Paperclip approval works in Inbox and Messenger), gap table "Standalone decisions"; task HAL-18872

The Paperclip provider shall list every open Paperclip decision (`GET /api/companies/{company}/decisions?status=open`) in the inbox, with the decision's title and body as its question, each of its options as a button in Paperclip's order, and the task the agent asked from as its work. When the person picks an option, the provider shall send `POST /api/decisions/{id}/decide` with that `optionId` and an idempotency key made from the decision and the option, so picking it twice decides once. It shall refuse, without sending, an option the decision doesn't offer and any answer to a decision that needs a written value. When the decision was already decided, it shall answer `already-answered` with who decided it. A decision with a destructive option shall be `risky`.

## Examples

- Given an open decision "Which launch day?" with the options Friday and Monday, asked from task HAL-12,
  when the inbox is read,
  then it shows "Which launch day?" with the buttons Friday and Monday, from HAL-12.
- Given that decision,
  when the person picks Monday,
  then the provider sends `decide` with `{ "optionId": "monday", "idempotencyKey": "halonic:<id>:monday" }`.
- Given a decision with a required input,
  when the person picks an option,
  then nothing is sent and the answer is refused.
- Given a decision someone decided in Paperclip,
  when the person picks an option in Halonic,
  then the answer is `already-answered`, with who decided it.
