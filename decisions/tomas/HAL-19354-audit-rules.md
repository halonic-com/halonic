# Decision: the seat mover follows the board's audit rules

- Task: HAL-19354
- Approval: the board's audit rules for the plugin mover, posted on HAL-19354 on 26 Nov (https://paperclip.halonic.com/HAL/issues/HAL-19354#comment-671fec72-2d83-4255-a283-efec38fd3ccc), which the board's shadow session audits every move against. Liam approves the change in review on HAL-19354.
- Kind: internal

## What changes

The seat mover gains the board's audit rules that it didn't have yet:

- **Reserve seats (rule 3).** A seat at 88% of its week or more is a reserve seat. Agents
  that aren't fast burners may stay on it and be moved onto it, up to the new hard stop of 95%
  (was 98%, and only for seats whose weekly reset was near). A fast burner
  (`seatMover.fastBurners`, by default Julian, Liam, Elena and Tomas) leaves a reserve seat
  and isn't moved onto one, unless its weekly reset is under 24 hours away. Reset-fill seats
  still take anyone.
- **Fast burners first (rule 3).** After the reviewers, the fast burners pick a seat before
  the heavy agents and everyone else, so they get the seats with the most 5-hour room.
- **Waiting seats are full (rule 2).** A seat runs are parked waiting for takes nobody,
  whatever its reading says, like a seat with a fresh `provider_quota` failure.
- **Paused agents never move (rule 5).** Before, a paused agent moved for where it sat (beside
  a reviewer, on Admin, on the paid API). Now it stays; a reviewer beside a paused agent
  leaves for an empty seat itself, as it already did beside a pinned agent.
- **Two hours between moves (rule 6).** The mover remembers when it moved each agent. For two
  hours (`seatMover.moveCooldownMinutes`) that agent moves again only when it is parked or its
  seat is full or unusable, not for who it sits with.

The requirements `paperclip.seat-mover-checklist` and `paperclip.seat-mover-job` change to
match, with two new examples. The settings form gains the two new settings. Tests cover each
rule; the tests that encoded the old rules (anyone leaves at 88%, paused agents move for
seating) now check the new ones. No test was skipped.

The 500-state test also changes. Its number generator returned the low bits of its state,
which repeat every few draws: almost every agent in its states was paused. That went unseen
while paused agents still moved for seating; once they never move, the test planned only 15
moves. It now draws from the high bits, and its states also draw the new waiting seats and
recently moved agents. Its draws are different, so its expect count changes. Every assertion
is still there and still runs on every state.

## Why

The first pass in `act` mode (26 Nov, 11:55 UTC, logged on HAL-16116) moved five light agents
off the quiet Nina seat, which was at 89% of its week, because the old item a allowed nobody on
a seat at 88% or more. The board's rules allow slow agents on such a reserve seat, so the move
broke rules 3 and 4. The other rules were missing in the same way.

## Covers

- paperclip.seat-mover-checklist
- paperclip.seat-mover-job
