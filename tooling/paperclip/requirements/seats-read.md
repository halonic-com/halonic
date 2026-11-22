# paperclip.seats-read

- Status: active
- Since: unreleased
- Source: HAL-16008; `seats.read` in the seat forecast on HAL-15997 (section 4.1) and the spike on HAL-16005 (option a: the board-approved `claude` calls)

When the `seats` plugin reads a seat, it shall run `claude auth status --json` and then, only for a Claude subscription sign-in on the seat's own account, `claude -p /usage`, each without a shell, with a time limit and with only the seat's folder and the environment it was given, and it shall try a usage read that timed out or printed nothing readable once more, but not one that was rate-limited.

## Examples

- Given a seat signed in with its subscription and a `/usage` text with a session, a week and a Sonnet week,
  when it is read,
  then the reading holds the three windows and no error.
- Given a seat that is signed out, signed in with an API key, or signed in to another account,
  when it is read,
  then the reading's error is `signed-out` and `/usage` is not run.
- Given a usage read that times out twice,
  when the seat is read,
  then `/usage` ran twice and the reading's error is `timeout`.
- Given a usage read that says it hit a rate limit,
  when the seat is read,
  then `/usage` ran once and the reading's error is `rate-limited`.
- Given a worker environment with an API key,
  when a seat is read,
  then the program gets only the given variables and the seat's folder.
