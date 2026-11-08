# check.guard-approval-fails-closed

- Status: active
- Since: 0.1.0
- Source: HAL-118 (plan 9.3; the Paperclip token is parked on HAL-58)

While the Paperclip approval lookup has no API token, the requirement guard shall treat every decision note's approval as not verified.

## Examples

- Given a well-formed note that lists the change,
  when the guard checks its approval with the built-in lookup,
  then the approval is not verified and the guard fails.
