# format.parity-fixtures

- Status: active
- Since: 0.1.0
- Source: HAL-113, Julian's fixtures in `packages/testing/parity` (plan 9.3 point 7)

When `parseFile` reads each fixture file the old loader read, on its own, it shall give the recorded pass or fail and, for a failing file, the recorded issue paths, codes, lines and columns (paths and codes only for skills, which had no line), except for the cases listed with the requirement that explains them. Checks between files are the phase 2 loader's.

## Examples

- Given every recorded file of the base and the cases, when it is parsed, then the result matches the recording.
- Given case `routine/mail-every-15m`, when it is parsed, then it passes (format.routine-mail-interval).
- Given case `deployments/unknown-default`, when it is parsed, then it fails at `default` (format.deployments-file).
