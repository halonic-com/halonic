# paperclip.seats-summary

- Status: active
- Since: unreleased
- Source: HAL-17625; section 1.5 of the phase 2 architecture note on HAL-17511 (D1), with Julian's security read on HAL-17540 (T2)

When a caller asks the `seats` plugin's `GET /seats/summary` route, the plugin shall answer only a signed-in board user, with each seat's label, role, newest reading time, usage windows with their used percentage, reset time and the time they reach 90%, the agents on it by name, whether its manual reset is used, and the proposal `seats.check` would post now as plain text, and shall never carry a seat's folder, expected account, connection id or sign-in expiry.

## Examples

- Given an agent's key,
  when it asks for the summary,
  then the plugin refuses with 403 and reads nothing.
- Given a seat with a folder, an expected account and a connection id in the settings, its 5-hour window at 85% rising 5 points an hour and resetting in 2 hours,
  when a board user asks for the summary,
  then the seat shows its label, the window at 85% with its reset time and the time it reaches 90%, and the answer holds none of the folder, the account or the connection id.
- Given a seat whose 5-hour window is full with an agent on it and a free seat,
  when a board user asks for the summary,
  then the answer holds the proposal to move that agent as plain text, with no Markdown marks, and the time it was made.
