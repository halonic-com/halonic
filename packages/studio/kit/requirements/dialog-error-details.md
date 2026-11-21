# kit.dialog-error-details

- Status: draft
- Since: unreleased
- Source: HAL-15244 (design check C551 I5 of HAL-15217); C533-3 of HAL-15056

When a Dialog shows an `error` with `errorDetails`, such as the command the error says to run, the details shall follow the error's Callout, 16px under it, outside the alert slot, so that a screen reader reads only the error's sentence. They shall show only while the error shows, on the desktop box and in the phone's form sheet alike.

## Examples

- Given a form sheet with the error "Not started. Run this:" and a command as its details,
  when the error shows,
  then the command follows the Callout, outside the alert, as the last thing in the body.
- Given a form sheet with details and no error,
  when it opens,
  then the details don't show.
