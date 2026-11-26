# action-steppers.request-expiry

- Status: active
- Since: unreleased
- Source: stream HAL-17488 (user-only action steppers); architecture note on HAL-17491, sections 1.1 and 6.1

When the stepper is asked to start a request, the action-steppers package shall refuse it if the request already finished or its expiry has passed, where the expiry is 24 hours after the request arrived unless the definition or the requester sets an earlier one, and neither can set a later one.

## Examples

- Given a request with no `expires`,
  when the user starts it 24 hours after it arrived,
  then the stepper refuses it as expired.
- Given a requester that asks for an expiry 3 days away,
  when the expiry is worked out,
  then it is 24 hours after the request arrived.
- Given a request that already finished,
  when the user starts it again,
  then the stepper refuses it as closed.
