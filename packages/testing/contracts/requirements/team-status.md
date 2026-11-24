# contracts.team-status

- Status: active
- Since: unreleased
- Source: Liam's approval of the HAL-17712 plan (24 Nov): the contract checks the optional table 1.6 fields of `TeamStatus`; requirement `ports.team-status`

Where an adapter implements `TeamStatus`, it shall pass this suite both when it serves the optional table 1.6 fields and when it leaves them out. Every seat with a `failedRead` shall have the state `not-read`, and every spend summary's `unpricedRuns` and `unknownSeatRuns`, when given, shall be whole numbers that are never negative. The suite shall also offer these checks on their own, so a test can show that a seat with a `failedRead` and the state `ok` fails them.

## Examples

- Given a seat with a `failedRead` and the state `ok`,
  when it is checked,
  then it fails the contract.
- Given a spend summary with `unknownSeatRuns` of -1,
  when it is checked,
  then it fails the contract.
- Given a source that leaves out `failedRead`, `unknownSeatRuns` and `fromCache`,
  when the suite runs against it,
  then it passes.
