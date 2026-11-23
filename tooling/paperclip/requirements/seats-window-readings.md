# paperclip.seats-window-readings

- Status: active
- Since: unreleased
- Source: HAL-16692; the seat usage forecast (HAL-16026), part of the `seats` plugin (HAL-16008)

When the seats forecast reads the plugin's stored seat readings, it shall split each reading into one reading per window it holds (the 5-hour session, the week, and each per-model weekly window under `week:` and the label Claude Code prints), each with the seat, the reading's time, the used percent and the reset time, and shall give no window reading for a read that failed.

## Examples

- Given a made-up reading of `seat-a` with a session, a week and a "Sonnet only" weekly window,
  when it is split,
  then there are three window readings, `session`, `week` and `week:Sonnet only`, each with the seat, the time, its percent and its reset time.
- Given a made-up reading of `seat-b` that timed out,
  when it is split,
  then it gives no window readings.
