# paperclip.seats-check-proposal

- Status: active
- Since: unreleased
- Source: HAL-16008; `seats.check` only proposes moves, posted on a task, and the board applies them (supervision plugins plan on HAL-15997, phase 3); Liam's review note on #5174

When `seats.check` writes a proposal, it shall say that nothing has moved, give each move with its agent, both seats and the reason in numbers, say so when no seat can take an agent, show how many agents each receiving seat holds now and would hold after the moves, give each piece of reset advice with the seat's week, and write nothing when there is nothing to propose.

## Examples

- Given an agent on a seat at 82% of its 5-hour window that moves to seat B,
  when the proposal is written,
  then it reads that the agent moves from that seat to B because the 5-hour window is at 82%.
- Given three agents that all move to seat B, which holds one agent now, and no agents-per-seat limit,
  when the proposal is written,
  then it shows that B would hold 4 agents (1 now) and that no limit is set.
- Given an agent that must move and no seat that can take it,
  when the proposal is written,
  then it says no seat can take it now.
- Given no moves and no reset advice,
  when the proposal is written,
  then there is no proposal to post.
