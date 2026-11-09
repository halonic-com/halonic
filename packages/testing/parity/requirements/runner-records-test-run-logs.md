# parity.runner-records-test-run-logs

- Status: active
- Since: 0.1.0
- Source: HAL-1518

When the recorder records the base, the old runner shall also run every workflow test of the base workspace with the old test runner, and the recorder shall write `run-logs.json` next to the base's `recorded.json`. For each test it holds whether the old runner passed it, its failures, and every run the test started (its own and those of nested workflows), each with its summary and its events in order.

Each test case shall run with fixed IDs that start again for every case, and a clock that stands still at 2026-01-01T00:00:00Z and moves only on the test's `advance` steps. The real clock (`Date.now`) shall read the same time while a test runs, and be given back after.

The runner shall run each test case twice. If the two run logs differ, then it shall stop and name the test, because the log still depends on the real clock or random IDs. If a run log carries a random old run ID, then the recorder shall refuse to write it. If the old loader gives no workspace, then the runner shall stop and say the tests can't run.

## Examples

- Given the base's `approval` test "the timer fires after two days", then its run `test_1` starts at 2026-01-01T00:00:00Z and its timer fires at 2026-01-03T00:00:00Z.
- Given a test that starts a nested workflow, then its runs are `test_1` (its own) and `test_2` (the nested one), in that order.
- Given a test whose log holds `Math.random()`, then recording stops and names that test.
- Given a run log that holds `test_mw6zmn5u_8202b972`, then recording fails.
- Given a case (not the base), then no `run-logs.json` is written for it.
