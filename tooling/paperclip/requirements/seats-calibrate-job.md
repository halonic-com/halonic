# paperclip.seats-calibrate-job

- Status: active
- Since: unreleased
- Source: HAL-16692; wiring the seat forecast (HAL-16026) into the `seats` plugin (HAL-16008); Liam's review note on #5007

While the `seats` plugin runs, `seats.calibrate` shall every night, for the one company whose settings list the seats, load the last 7 days of stored readings, placements and usage and the fits of the 8 days before, calibrate the forecast on them, store the new fits in place of any made the same day for the same plan, model and window, remove fits older than 30 days, and log how many fits it stored, how many plans, models and windows had too few steps, and how many steps it skipped because their tokens were on no seat, with no seat folder, account, connection id or agent name.

## Examples

- Given a made-up seat read every 10 minutes for 5 hours, with one agent's tokens between each two readings,
  when `seats.calibrate` runs,
  then it stores one fit for the seat's week window under the plan `unknown`, and removes fits made before the 30 days.
- Given another agent's tokens on no known seat during one of those steps,
  when `seats.calibrate` runs,
  then its log says 1 step was skipped because its tokens were on no seat.
- Given no company whose settings list seats,
  when `seats.calibrate` runs,
  then it reads and stores nothing.
