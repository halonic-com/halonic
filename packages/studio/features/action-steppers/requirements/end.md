# action-steppers.end

- Status: active
- Since: unreleased
- Source: HAL-17527 (approvals stream HAL-17488, PR 8); architecture note on HAL-17491, sections 1.3, 2.3 and 2.4; the board's decision on HAL-10 (24 Nov) that the screens follow the approved Inbox look, and section 1.2 (a definition this version doesn't have)

When a request is declined, expired or finished, the stepper shall say so in one line and offer no buttons. When the installed Halonic doesn't know the request's definition, the stepper shall say it isn't available in this version and show no steps. Where the request can't run, such as Studio in a browser, the stepper shall say "Open it in the desktop app to run it." and offer only **Decline**.

## Examples

- Given a declined request,
  when it opens,
  then it says "You declined this request. Nothing more will run." and shows no buttons.
- Given a request opened in Studio in a browser,
  when it opens,
  then it says "Open it in the desktop app to run it." and offers only **Decline**.
