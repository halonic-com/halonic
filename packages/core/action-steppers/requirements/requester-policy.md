# action-steppers.requester-policy

- Status: active
- Since: unreleased
- Source: stream HAL-17488 (user-only action steppers); architecture note on HAL-17491, section 6.5 with Julian's minor on revision 2; task HAL-17517

When the user opens a stepper request, the action-steppers package shall let a `routine` request or the user's own request run, and shall let an `admin` or `irreversible` request run only when the user's policy allows the source the messaging provider attests; a rule that names agents shall allow only requests that claim one of them, so an agent's name can narrow a rule but never widen it. Otherwise the request is blocked.

## Examples

- Given the default policy,
  when a Paperclip source asks for an `admin` request,
  then it is blocked; and a `routine` one is allowed.
- Given a policy allowing the Halonic workspace `acme` with the agent `release-bot` only,
  when a request from the Paperclip instance claims `release-bot`,
  then it is blocked, because the attested source differs.
- Given the same policy,
  when a request from `acme` claims `other-bot`,
  then it is blocked; and one claiming `release-bot` is allowed.
