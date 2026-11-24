# paperclip.seats-accuracy-job

- Status: active
- Since: unreleased
- Source: HAL-16692; wiring the seat forecast (HAL-16026) into the `seats` plugin (HAL-16008); the seat usage forecast on HAL-15997 (document `seat-forecast`, sections 4.5 and 5: plugin state holds only the latest values)

While the `seats` plugin runs, `seats.accuracy` shall every night, for the one company whose settings list the seats, score the stored forecast points whose target time falls on the day before (UTC) against the seats' readings of that day and one read interval on each side, counting the scores of the 14 days before; store the scores in place of any stored for the same day, window and horizon; remove scores older than 30 days; keep that night's scores, the alert and the good days in a row in the plugin's state; log how many points it scored and stored, the 1-hour median error of the 5-hour window and the good days in a row; and log a warning when the 5-hour window's 1-hour forecasts had a median error above 3 points on that day and the day before, with no seat folder, account, connection id or agent name. It shall propose and change nothing.

## Examples

- Given a made-up seat's 1-hour forecast of its 5-hour window for 10:00 yesterday at P50 40, a reading of 45 two minutes later, and a stored median error of 4 points the day before,
  when `seats.accuracy` runs just after midnight,
  then it stores a score of 5 points for yesterday and logs a warning that the 5-hour window's 1-hour forecasts were off on 2 days in a row.
- Given the same forecast read at 41 and stored good days the two days before,
  when `seats.accuracy` runs,
  then it logs no warning and counts 3 good days in a row.
- Given a run at 00:40 on 23 November,
  when `seats.accuracy` runs,
  then it loads the points targeting 22 November, the readings from 23:50 on 21 November, the scores from 8 November, and removes the scores before 23 October.
- Given no company whose settings list seats,
  when `seats.accuracy` runs,
  then it reads and stores nothing.

## Limits

- The alert is a warning in the plugin's log and a flag in its state; Grafana alerts on the stored scores. The job opens no task.
