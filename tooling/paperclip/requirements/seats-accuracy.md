# paperclip.seats-accuracy

- Status: active
- Since: unreleased
- Source: HAL-16026; the seat usage forecast on HAL-15997 (document `seat-forecast`, section 4.5), part of the `seats` plugin (HAL-16008)

When the `seats.accuracy` job runs, the seats forecast shall score every stored forecast point 1, 5 and 24 hours ahead against the reading of the same seat and window nearest its target time (within one read interval), giving per day, window and horizon the number scored, the median and 90th-percentile error of P50 in points and the share between P50 and P90; it shall report the 5-hour window as degraded when its 1-hour forecasts had a median error above 3 points on the newest scored day and the day before, counting scores stored by earlier runs, and count the good days in a row that phase 4 needs.

## Examples

- Given three 1-hour forecasts of a made-up seat's 5-hour window at P50 40 and P90 50, read 4 minutes late at 45, on time at 38 and at 60,
  when they are scored,
  then the median error is 5 points and one in three fell inside the band.
- Given a 2-hour forecast, or a forecast with no reading within one 10-minute read interval of its target,
  when it is scored,
  then it isn't counted.
- Given 1-hour median errors of 3.5 and 5 points on two days in a row,
  when the alert is checked,
  then the 5-hour window is degraded; a good or missing day between two bad days leaves it not degraded.
- Given a stored bad day yesterday and a 1-hour forecast off by 6 points tonight,
  when the nightly run scores it,
  then the 5-hour window is degraded.
- Given good days on 19, 20 and 21 November,
  when the good days are counted,
  then the streak is 3; a bad or missing day ends it.
