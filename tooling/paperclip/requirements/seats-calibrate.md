# paperclip.seats-calibrate

- Status: active
- Since: unreleased
- Source: HAL-16026; the seat usage forecast on HAL-15997 (document `seat-forecast`, sections 4.2 and 5), part of the `seats` plugin (HAL-16008)

When the `seats.calibrate` job runs, the seats forecast shall fit the points per million input, cached and output tokens for each plan, model and window (5-hour session and week) from the 10-minute steps of the last 7 days, skipping any step that holds a reset, an agent moving on or off the seat, a gap of more than twice the plugin's read interval or tokens from two models; it shall give each fit its day, the first and last bucket it used, its number of steps and its middle and 90th-percentile error in points, give no fit for fewer than 24 usable steps, and record how far the fit's cost on its own token mix moved against the oldest fit of the week before, flagging a move of more than 25%.

## Examples

- Given a made-up seat whose week reading rises 1 point between two readings 10 minutes apart, with one agent's tokens in between,
  when the steps are built,
  then that step holds those tokens and 1 point.
- Given steps with a drop in the percentage, an agent placed on the seat, a 40-minute gap or two models,
  when the steps are built,
  then those steps are left out.
- Given a seat read every 15 minutes, with readings 30 minutes apart,
  when the steps are built,
  then those steps are kept.
- Given a seat with no plan,
  when the steps are built,
  then its steps are under the plan `unknown`.
- Given 2 days of whole-percent readings of a seat that really uses 0.4 points a step,
  when it is calibrated,
  then the fitted cost of one step's tokens is between 0.3 and 0.5 points, and the fit holds its day, its first and last bucket and a middle and 90th-percentile error under 1 point.
- Given only 5 usable steps for a plan, model and window,
  when it is calibrated,
  then there is no fit and the run says it had too few steps.
- Given a new fit 43% dearer on its token mix than the oldest fit of the week before,
  when it is calibrated,
  then its week shift is 0.43 and it is flagged; an 8% change is recorded but not flagged, and with no fit within the week before there is no shift.
