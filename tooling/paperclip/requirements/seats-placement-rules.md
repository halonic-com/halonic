# paperclip.seats-placement-rules

- Status: active
- Since: unreleased
- Source: HAL-16008; the placement rules in the seat forecast plan on HAL-15997 (section 4.4)

When the `seats` plugin proposes seat moves, it shall propose moving every agent off a paid-API seat, and off a readable seat at 80% of its 5-hour window, projected above 90% of it within 60 minutes, or at 88% of its week; it shall send each agent to a readable, active pool seat below those limits, and only to a reserve when no pool seat fits, with the soonest weekly reset first, and say so when no seat fits; and it shall advise a manual reset for at most one seat at its weekly limit in each reset group that hasn't used its reset, when the weekly reset is three or more days away.

The thresholds, the projection time, the days and a limit of agents per seat are settings with these defaults. A seat whose newest read failed or is too old is left alone: no one moves off it or onto it.

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
- Given two free pool seats whose weeks reset on Tuesday and on Friday, and a free reserve,
  when an agent must move,
  then it goes to the seat that resets on Tuesday, and to the reserve only when neither pool seat fits.
- Given an agent on the paid-API seat,
  when moves are proposed,
  then it moves off, and no agent is ever sent there.
- Given a seat at 95% of its week whose reset group hasn't used its reset and whose weekly reset is four days away,
  when moves are proposed,
  then the proposal advises a manual reset of that seat.
