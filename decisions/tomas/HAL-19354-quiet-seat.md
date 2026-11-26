# Decision: the seat mover keeps heavy agents off the timer agents' seat

- Task: HAL-19354
- Approval: the board's pre-move checklist item g (timer agents on the quiet seat, no fast burner moved onto it), which the board supervisor asked the mover to be checked against before act mode on HAL-19354 (https://paperclip.halonic.com/HAL/issues/HAL-19354#comment-86bbdf18-45fb-4b30-b1b9-e7cf22db1830). Liam approves the change in review on HAL-19354.
- Kind: internal
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:Hrn2ldOsOFpmXFxZ/ME649JRtIt66YhfX8ZbtjZNQ9CoiE7l4VXQoQ9URKfZb6BXANHempk7q8PnyCWncXYpCg==

## What changes

A seat any agent on the seat mover's never-move list (`seatMover.pinned`) sits on is the quiet
seat. The board puts the timer agents and the seat starter on that list, so their seat is the
quiet one; pinning anyone else would close that agent's seat to heavy agents too. The mover never sends a
running heavy agent there, moves one that already sits there off, and refuses a batch that adds
one. Reviewers were already kept off, because a reviewer only takes an empty seat. Light agents
may still join.

The requirement `paperclip.seat-mover-checklist` gains item g, the new move reason and the new
break, plus one example. Tests for the target refusal, the move off, the stuck case and the break
are added, and the 500-state test now includes a pinned agent. No test was weakened or skipped.

The requirement's tests make 2220 expect calls instead of 2252. That comes from the 500-state
test: it makes one expect per planned move and one per break a seat keeps. The pinned agent is
drawn last, so the seats and the other agents draw exactly as before. The drop comes from the
pinned agent's seat: it is no longer empty, so it takes no reviewer, and by item g it takes no
running heavy agent, so some agents that moved before are now stuck. Every assertion is still
there and still runs on every state.

## Why

The mover had items a–f of the board's checklist but not g. With the board's settings (timer
agents pinned on the Nina seat), the quiet Nina seat is often the one with the most 5-hour room,
so the mover would have sent a heavy builder there, breaking item g.

## Covers

- paperclip.seat-mover-checklist
