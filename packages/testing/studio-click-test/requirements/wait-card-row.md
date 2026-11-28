# studio-click-test.wait-card-row

- Status: active
- Since: unreleased
- Source: HAL-20621, the click step for `inbox.wait-card` that Nora's review of #6831 (HAL-19399 G8) left to a follow-up

When the wait card step has started the demo's Support reply from the Inbox's New request, in a window wide enough for a desktop, and its card for the review step shows Approve and Reject, the click test shall read where the app drew both buttons and the row that holds them, and shall fail the step as `WAIT_ANSWERS_LAYOUT`, naming every box, unless both sit in one row, Approve is at the right of Reject and ends at the row's right edge, and the row has room left before Reject, so neither button is stretched to fill it. It shall find that row as the nearest box holding both buttons, not by a class name. Before that, it shall fail the step as `NO_INBOX` when Places has no Inbox, `NO_REQUEST_FORM` when New request opens no form, `NO_SEND` when the form has no Send, `NO_WAIT_CARD` when the run's card doesn't show within three minutes, and `NO_WAIT_ANSWERS` when the card, opened from its row if need be, shows no Approve.

## Examples

- Given a 600px row holding Reject at 400 to 480px and Approve at 488 to 600px, with the same top,
  then the step passes.
- Given Approve on a line under Reject,
  then the step fails as `WAIT_ANSWERS_LAYOUT`.
- Given Approve at the left of Reject,
  then the step fails as `WAIT_ANSWERS_LAYOUT`.
- Given Reject starting at the row's left edge, the two filling the row,
  then the step fails as `WAIT_ANSWERS_LAYOUT`.
- Given the run never reaches its review step,
  then the step fails as `NO_WAIT_CARD`.
