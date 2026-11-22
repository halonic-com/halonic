# paperclip.seats-page-view

- Status: active
- Since: unreleased
- Source: HAL-16008; the "AI seats" page in the seat forecast on HAL-15997 (section 6), whose forecast numbers come with HAL-16026

When a board user opens the "AI seats" page, the `seats` plugin shall show the pool's weekly points left with how many pool seats can't be read, the pool's points per hour now, the next refill, one row per seat (its state, both windows with when each reaches 80% and 90% and when it resets, its agents by name, its reading age and next read, and its sign-in expiry), the weekly points coming back in each hour of the next 7 days, and the moves `seats.check` would propose with their reason in numbers; it shall get the page's data only through Paperclip's data bridge, which answers only board users, and it shall record a manual reset only for a signed-in board user and only in the company Paperclip checked.

## Examples

- Given an agent calling the page's manual reset,
  when it asks to reset a seat,
  then the plugin refuses and records nothing.
- Given a board user,
  when they record a manual reset of `seat-a` and then of another seat in its reset group,
  then the first is recorded as theirs and the second is refused with the first one's time.
- Given a board user whose call has no company Paperclip checked,
  when they record a manual reset,
  then the plugin refuses and records nothing.
- Given one unreadable pool seat and 100 weekly points left on the others,
  when the board opens the page,
  then the first card says 100 points, with 1 seat that can't be read.
- Given a seat at 70% of its 5-hour window, rising 20% an hour, with its reset in 2 hours,
  when the board opens the page,
  then its row says "70% used, 80% in 30 min, 90% in 1 h, resets in 2 h".
- Given a pool seat whose week gives back 35 points in 3 days and 5 hours,
  when the board opens the page,
  then the 7-day calendar has 168 hours and puts 35 points in that hour only.
- Given an agent on a seat whose week is full and no seat with room,
  when the board opens the page,
  then the move says "week at 90%" and that no seat can take the agent now.
