# paperclip.seat-mover-spread

- Status: active
- Since: unreleased
- Source: HAL-19394; Liam's review of the seat mover (HAL-19354); Julian's review of #6452 (HAL-19464)

When the Agent tools plugin's seat mover picks a target for an agent, it shall prefer, among the seats that pass the checklist (`paperclip.seat-mover-checklist`), the seat it has sent the fewest agents to in the same pass, before the seat with the most 5-hour room, so agents leaving one full seat in one pass spread over the legal seats instead of all taking the same one. A reviewer that shares its seat with an agent the mover never moves (a pinned agent) shall be placed before the other agents spread, so spreading doesn't take the empty seat it needs.

## Examples

- Given two light agents on a seat at 85% of its 5-hour window and legal seats at 40% and 20%,
  when the seat mover plans,
  then one agent moves to the seat at 20% and the other to the seat at 40%.
- Given two light agents on a seat at 85%, a seat at 10% with one agent, an empty seat at 30%, and a reviewer sharing a seat at 10% with a pinned agent,
  when the seat mover plans,
  then the reviewer moves to the empty seat, the two agents move to the other legal seats, and nobody is listed as stuck.
