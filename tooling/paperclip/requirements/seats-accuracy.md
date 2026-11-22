# paperclip.seats-accuracy

- Status: active
- Since: unreleased
- Source: HAL-16026; the seat usage forecast on HAL-15997 (document `seat-forecast`, section 4.5), part of the `seats` plugin (HAL-16008)

When the `seats.accuracy` job runs, the seats forecast shall score every stored forecast 1, 5 and 24 hours ahead against the reading of the same scope and subject nearest its time (within 10 minutes), giving per day, scope and horizon the number scored, the median and 90th-percentile error of P50, the share between P50 and P90 and the share at or below P90; it shall raise an alert on the second of two days in a row on which 1-hour forecasts of a seat's 5-hour window had a median error above 3 points, and count the good days in a row that phase 4 needs.

## Examples

- Given three 1-hour forecasts of a made-up seat at P50 40 and P90 50, read 4 minutes late at 45, on time at 38 and at 60,
  when they are scored,
  then the median error is 5, one in three fell inside the band and two in three at or below P90.
- Given a 2-hour forecast, or a forecast with no reading within 10 minutes of its time,
  when it is scored,
  then it isn't counted.
- Given 1-hour median errors of 3.5 and 5 points on two days in a row,
  when the alert is checked,
  then it is raised on the second day; two bad days with a good or missing day between raise nothing.
- Given good days on 19, 20 and 21 November,
  when the good days are counted,
  then the streak is 3; a bad or missing day ends it.
