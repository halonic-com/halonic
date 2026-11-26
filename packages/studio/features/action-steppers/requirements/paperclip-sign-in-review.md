# action-steppers.paperclip-sign-in-review

- Status: active
- Since: unreleased
- Source: HAL-17545 (approvals stream HAL-17488, PR 13), Liam's approval of option (A); architecture note on HAL-17491, row 15

When the stepper shows a request whose definition has `sign-in` steps for review, each such step shall keep its part of the sign-in, and "Show the request" shall say what that part does: "Starts a Paperclip sign-in in the desktop app and shows its code", "Opens the approval page the sign-in gives, on the connection's own Paperclip", "Waits for your approval, then keeps the key in this computer's keychain" and "Says who is signed in, and revokes the key of a test sign-in".

## Examples

- Given a request for a definition with the four parts of a Paperclip sign-in,
  when it is shown for review,
  then its steps are the parts `start`, `approve`, `keep` and `test`, in order.
- Given the `approve` part,
  when "Show the request" is open,
  then it says "Opens the approval page the sign-in gives, on the connection's own Paperclip".
