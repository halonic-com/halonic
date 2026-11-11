# test-runner.parity-run-logs

- Status: active
- Since: 0.1.0
- Source: HAL-1541 (HAL-186 step 8)

When the runner runs the base parity fixture's workflow tests from the old runner's fixed time (2026-01-01T00:00:00Z), every test shall pass as it did in the old runner, and each test's runs, with their summaries and events in order, shall equal the old runner's run logs in `run-logs.json` once the run-log rules of the allowed differences are applied. A test that still differs shall be named by a known gap, with the task that fixes it. A rule that changes no test, and a known gap whose test matches, shall fail the check, so neither list keeps an entry that no longer applies.

## Examples

- Given the base's `approval` test "one day is not enough",
  when it runs,
  then its run differs from the old `test_1` only in the waiting run's context, once child run IDs, `definitionsVersion`, the waiting labels and the new summary fields are left out, and the known gap `initial-context-unlogged` names it.
- Given the base's `batch` test,
  when it runs,
  then its foreach items run in a sliding window of two, and its runs equal the old ones once each stretch of item events is sorted by item, apart from the known gaps it is named in.
- Given a known gap that names "an approved invoice is paid and announced",
  when the engine is fixed and that test equals the old one,
  then the check fails until the gap is removed.
