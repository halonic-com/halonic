# paperclip.seats-auth-status

- Status: active
- Since: unreleased
- Source: HAL-16008; the `seats` plugin in the supervision plugins plan on HAL-15997 (phase 3); sign-in details stay board-only and are never logged

When the `seats` plugin reads a seat's `claude auth status --json` output, it shall report the seat as signed in only for a Claude subscription sign-in, as not a subscription for any other sign-in, as signed out or as unreadable otherwise, and it shall compare the account's e-mail with the account the board set for the seat without keeping the e-mail in the result.

## Examples

- Given a subscription sign-in for the seat's own account,
  when it is read,
  then the seat is signed in, its account matches and the result holds no e-mail.
- Given a sign-in for another account,
  when it is read,
  then the account differs.
- Given an API key sign-in,
  when it is read,
  then the seat is not a subscription.
- Given `{"loggedIn": false}`,
  when it is read,
  then the seat is signed out.
- Given output that isn't JSON,
  when it is read,
  then the seat is unreadable.
