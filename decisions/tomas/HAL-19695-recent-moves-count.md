# Decision: the seat mover counts its own moves since a seat's reading as arrivals

- Approval: https://paperclip.halonic.com/HAL/issues/HAL-19695 (the follow-up agreed in Julian's review of #6539 on HAL-19354). Liam approves the change in review on HAL-19695.
- Kind: internal

## What changes

The seat mover keeps 10% of a target seat's 5-hour window (`seatMover.targetHeadroomPercent`)
for each agent it sends there, and spreads agents to the seat with the fewest arrivals. Until
now both counted only the agents sent in the same pass. Now they also count the agents an
earlier pass moved onto the seat after the seat's reading was taken, as long as they still sit
there. The plan's headroom check, its target order and act mode's re-check before each move
all use the same count.

The mover's memory gains `movedTo` (agent id → the seat it last moved the agent to), kept and
dropped together with `movedAt`, the move times it already kept for the two-hour cooldown. A
reading older than 45 minutes doesn't count at all, so every move after a usable reading is
still in the memory.

The requirement `paperclip.seat-mover-checklist` changes to match (items b and f) and gains an
example. New tests cover a move after the reading (counts, the seat is refused), a move before
it (doesn't count) and a move to a seat the agent has since left (doesn't count), for the
headroom and for the target order. No test was changed, skipped or removed.

## Why

Seat readings refresh only at :17 and :47 and can be up to 30 minutes old. The next pass, a
minute after a move, saw the same reading with none of the moved agents in it and could send
more agents to the same seat. That filled the seat past the room the headroom was meant to
keep, and the next reading moved agents off again (churn). Julian found it in his review of
#6539.

## Covers

- paperclip.seat-mover-checklist
