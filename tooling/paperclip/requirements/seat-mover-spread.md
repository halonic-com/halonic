# paperclip.seat-mover-spread

- Status: active
- Since: unreleased
- Source: HAL-19394; Liam's review of the seat mover (HAL-19354)

When the Agent tools plugin's seat mover picks a target for an agent, it shall prefer, among the seats that pass the checklist (`paperclip.seat-mover-checklist`), the seat it has sent the fewest agents to in the same pass, before the seat with the most 5-hour room, so agents leaving one full seat in one pass spread over the legal seats instead of all taking the same one. It shall also move an agent off a seat whose AI connection's status isn't `connected` (such as expired or revoked), paused or not, as it does for an excluded seat or the paid API, and never send an agent to such a seat; an agent no seat may take stays where it is and is listed as stuck.

## Examples

- Given two light agents on a seat at 85% of its 5-hour window and legal seats at 40% and 20%,
  when the seat mover plans,
  then one agent moves to the seat at 20% and the other to the seat at 40%.
- Given an agent on a seat whose connection was revoked and a legal seat at 30%,
  when the seat mover plans,
  then the agent moves to the seat at 30%.
- Given an agent on a seat whose connection was revoked and no legal seat,
  when the seat mover plans,
  then it moves nobody and lists the agent as stuck.
