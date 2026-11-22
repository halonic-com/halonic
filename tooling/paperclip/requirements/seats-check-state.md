# paperclip.seats-check-state

- Status: active
- Since: unreleased
- Source: HAL-16008; `seats.check` in the supervision plugins plan on HAL-15997 (phase 3); the placement rules in the seat forecast plan (section 4.4); Liam's review notes on #5121 and #5174

When `seats.check` gathers what the placement rules know, it shall take each seat in the settings with its windows and rates projected from its recent good readings, treat a seat as unreadable when its newest reading failed or is more than 30 minutes old, and count a reset group's manual reset as used once the board recorded one for any seat in it.

## Examples

- Given a seat read at 40% and then at 60% of its 5-hour window an hour later,
  when the rules' state is gathered,
  then that window is at 60% and rising 20% an hour.
- Given a seat whose newest read was rate-limited after a good one,
  when the rules' state is gathered,
  then the seat is unreadable but still shows its last good windows.
- Given a seat whose newest good reading is 40 minutes old,
  when the rules' state is gathered,
  then the seat is unreadable.
- Given a manual reset recorded for seat A, which shares reset group G with seat B,
  when the rules' state is gathered,
  then both seats count their manual reset as used.
- Given a newest reading whose weekly reset has passed,
  when the rules' state is gathered,
  then that week counts as unused again.
