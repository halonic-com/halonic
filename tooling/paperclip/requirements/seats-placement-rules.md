# paperclip.seats-placement-rules

- Status: active
- Since: unreleased
- Source: HAL-16008; the Seat Supervisor's placement rules on HAL-16021

When the `seats` plugin proposes seat moves, it shall propose moving every agent off a paid-API seat, and off a readable seat at 95% of its 5-hour window or heading there before the next check, at 80% of it, projected above 90% of it before its reset, at 88% of its week, or at 75% of its week with the weekly reset more than 24 hours away (a reserve); it shall send each agent to a readable, active pool seat that isn't a reserve, with its 5-hour window below 50% and its week below 75% (below 85% when its weekly reset is within 24 hours), the emptiest 5-hour window first and ties to the soonest weekly reset, at most 3 agents per seat, and only to a reserve when no such seat fits, and say so when no seat fits; and it shall advise a manual reset for at most one seat at its weekly limit in each reset group that hasn't used its reset, when the weekly reset is three or more days away.

The thresholds, the projection time, the days and the limit of agents per seat are settings with these defaults. The 88% weekly rule is checked before the reserve rule, so it fires first. A seat whose newest read failed or is too old is left alone: no one moves off it or onto it.

## Examples

- Given an agent on a seat at 82% of its 5-hour window and a pool seat at 20%,
  when moves are proposed,
  then the agent moves to that pool seat because the session is full.
- Given a seat at 70% that rises 30% an hour, with its reset two hours away,
  when moves are proposed,
  then its agents move because the session is projected above 90%.
- Given the same seat with its reset 10 minutes away,
  when moves are proposed,
  then its agents stay.
- Given two free pool seats with the same 5-hour use whose weeks reset on Tuesday and on Friday, and a free reserve,
  when an agent must move,
  then it goes to the seat that resets on Tuesday, and to the reserve only when neither pool seat fits.
- Given a seat at 96% of its 5-hour window with its reset five minutes away,
  when moves are proposed,
  then all its agents move.
- Given a seat at 78% of its week with the weekly reset four days away,
  when moves are proposed,
  then its agents move off it, and it takes agents only when no other seat fits.
- Given an agent on the paid-API seat,
  when moves are proposed,
  then it moves off, and no agent is ever sent there.
- Given a seat at 95% of its week whose reset group hasn't used its reset and whose weekly reset is four days away,
  when moves are proposed,
  then the proposal advises a manual reset of that seat.
