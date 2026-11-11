# parity.compare-cli-calls

- Status: active
- Since: 0.1.0
- Source: HAL-5228 (HAL-187 item 9)

When the compare is given the base's golden CLI calls (`cli.json`) and the new CLI's results for the same calls, it shall pair the calls by name and compare each pair exactly: the exit code, stdout, stderr, and every run the call stored with all its events in order, the runs in the order they started. It shall first apply, on the side each names, every CLI rule that an entry of `allowed-differences.json` lists in `cliRules`, in the compare's own order; the CLI rules are the CLI's own and every run-log rule, applied to a call's runs. A call equal as it is shall be `same`, equal after the rules `allowed`, still different and named in a known gap's `calls` `gap`, and otherwise `different`. A call only one side made shall differ.

A rule that changes no call shall be stale, and so shall a known gap whose call no longer differs or doesn't exist. The compare shall pass only when no call is `different` and nothing is stale.

## Examples

- Given an old and a new call that differ only in their output, run IDs and `definitionsVersion`, and entries that name `output-words`, `run-ids-by-start` and `no-definitions-version`, then the call is `allowed`.
- Given the same calls without the entry that names `no-definitions-version`, then the call is `different`.
- Given an old call that exited with 1 and a new one that exited with 0, then the call differs even with `output-words`.
- Given a new call that exited with 3, then `exit-codes-by-kind` leaves the 3, so the call differs.
- Given a known gap that names a call which is now the same, then the gap is stale.
- Given new runs `run_1.2` and `run_1`, where `run_1` started `run_1.2`, then they are compared as `run_1`, then `run_1.2`.
