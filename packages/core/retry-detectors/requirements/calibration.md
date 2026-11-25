# retry-detectors.calibration

- Status: active
- Since: unreleased
- Source: HAL-17088; the detector export's `calibratedOn` (board, 25 Nov, on HAL-17090)

The retry detectors package shall record the one writer setup (agent, model and provider) its coefficients were fitted on. When asked to score an attempt, finished or running, from any other setup, it shall refuse and return the calibrated setup instead of a score.

## Examples

- Given the shipped coefficients,
  then the calibrated setup is opencode, deepseek-v4.1-flash, deepinfra-fp8.
- Given a finished attempt that ran on another model or another provider,
  then it is refused, with the calibrated setup.
- Given a running attempt from another agent at minute 3,
  then it is refused, with the calibrated setup.
