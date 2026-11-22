# paperclip.seats-page

- Status: active
- Since: unreleased
- Source: HAL-16008; the "AI seats" page in the seat forecast on HAL-15997 (section 6), whose forecast numbers come with HAL-16026

When a board user asks for the "AI seats" page's data, the `seats` plugin shall answer only a board user, and shall give the pool's weekly points left over the readable pool seats, the pool's points per hour now, the pool seats' weekly refills of the next 7 days, one row per seat (its state, reading age, next read, sign-in expiry, alerts, 5-hour and weekly windows with when each reaches 80% and 90% before its reset at today's rate, and the agents on it by name) and the moves `seats.check` would propose now, from the stored readings, `seats.read`'s memory and Paperclip's agents only, moving no agent and never giving a folder, an account, a connection id or program output.

## Examples

- Given an agent,
  when it asks for the page's data,
  then the plugin refuses with 403 and reads nothing.
- Given two readable pool seats at 30% and 70% of their week, an unreadable pool seat and a reserve,
  when a board user asks for the page's data,
  then the pool has 100 weekly points left and one pool seat can't be read.
- Given a seat at 70% of its 5-hour window, rising 20% an hour, with its reset in 2 hours,
  when a board user asks for the page's data,
  then its row says it reaches 80% in 30 minutes and 90% in an hour.
- Given the same seat with its reset in 45 minutes,
  when a board user asks for the page's data,
  then its row says it reaches 80% and not 90%.
- Given a pool seat whose week resets in 3 days and one whose week resets in 8 days,
  when a board user asks for the page's data,
  then only the first is a refill in the next 7 days, and it is the next refill.
- Given an agent on a full seat and a seat with room,
  when a board user asks for the page's data,
  then the page shows the move with the agent's name, and no agent's settings change.
