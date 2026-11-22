# paperclip.seats-routes

- Status: active
- Since: unreleased
- Source: HAL-16008; the `seats` plugin in the supervision plugins plan on HAL-15997 (phase 3); sign-in details and seat edits board-only; the board records manual resets on the page (seat forecast, section 5)

When the `seats` plugin answers a route, it shall answer only a board user, show a seat's id, role and reset group but never its folder or expected account, and record a manual reset only for a seat in its settings, by that board user at the current time.

## Examples

- Given an agent calls the seat list,
  when the plugin answers,
  then it refuses with 403 and reads nothing.
- Given seats with a folder and an expected account,
  when a board user asks for the seat list,
  then each seat shows its id, role and reset group only, and whether moving agents is on.
- Given a board user records a manual reset for seat A,
  when the plugin answers,
  then it stores a manual reset for seat A by the board, with that user's id, at the current time.
- Given a manual reset for a seat that isn't in the settings,
  when the plugin answers,
  then it refuses with 404 and stores nothing.
