# paperclip.seats-summary

- Status: active
- Since: unreleased
- Source: HAL-17603; the phase 2 architecture note on HAL-17511, section 1.5 (D1) and Julian's T2 on HAL-17540: seat sign-in details never leave the plugin

When a board user asks the `seats` plugin for `GET /seats/summary`, the plugin shall answer each seat's label, role, state, usage windows with their percentage, reset time and the time they reach 90%, its agents' names and its manual reset, plus the proposal `seats.check` would make now in words, and shall never answer a seat's folder, expected account or connection id; it shall refuse anyone but a board user with 403.

## Examples

- Given an agent key calls the summary,
  when the plugin answers,
  then it refuses with 403 and reads nothing.
- Given seats with a folder, an expected account and a connection id,
  when a board user asks for the summary,
  then the answer contains none of them.
- Given a seat at 85% of its 5-hour window, rising 10 points an hour, with an agent on it,
  when a board user asks for the summary,
  then the seat is near its limit, its window reaches 90% in 30 minutes, and the proposal moves that agent off it.
