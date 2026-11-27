# inbox.agent-action-run

- Status: draft
- Since: unreleased
- Source: HAL-17535 (approvals stream HAL-17488, PR 9b); plan approved on HAL-18163; architecture note on HAL-17491, section 1.3; HAL-20265 (the sign-in steps)

While Studio runs as the desktop app and the Inbox has the action steps app service, an opened action item's stepper shall run its steps with the user's sign-in, and the item shall be answered through `AgentMessaging` with the stepper's result when it ends. Without that service, as in a browser, the item shall stay in review mode. Where the request has `sign-in` steps, the stepper shall run them through the desktop app's `ServiceSignIn` app service and open the approval page in the browser; without that service, it shall say the request isn't available here.

## Examples

- Given the desktop app, signed in to GitHub, and an admin request from Paperclip · Acme that the user's settings allow,
  when the user presses **Run step 1 of 1** and the step succeeds,
  then the item is answered with a `succeeded` result for step 1.
- Given the desktop app and a `paperclip.connect-and-test@1` request for a connection whose file exists,
  when the user opens it,
  then the stepper offers **Run step 1 of 4**.
