# parity.compare-run-logs

- Status: active
- Since: 0.1.0
- Source: HAL-1541 (HAL-186 step 8)

When the compare is given the base's golden run logs and the new runner's results, it shall pair the tests by `<hub>/<workflow>/<name>` and compare each pair exactly: pass or fail, the number of failures, and every run's summary and events in order. It shall first apply, on the side each names, every run-log rule that an entry of `allowed-differences.json` lists in `runRules`, in the compare's own order. A test equal as it is shall be `same`, equal after the rules `allowed`, still different and named by a known gap `gap`, and otherwise `different`. A test only one side ran shall differ.

A rule that changes no test shall be stale, and so shall a known gap whose test no longer differs or doesn't exist. The compare shall pass only when no test is `different` and nothing is stale.

## Examples

- Given an old and a new test that differ only in `definitionsVersion`, and an entry that names `no-definitions-version`, then the test is `allowed`.
- Given the same tests and no entry that names a rule, then the test is `different`.
- Given a test that differs in an agent's output, and a known gap that names it, then the test is `gap`.
- Given a known gap that names a test which is now the same, then the gap is stale.
- Given an entry that names `foreach-items-in-order` and tests without a foreach, then the rule is stale.
- Given a test the old runner ran and the new one didn't, then the test is `different`.
