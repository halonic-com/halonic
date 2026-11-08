# check.trace-runs-only-when-named

- Status: active
- Since: 0.1.0
- Source: HAL-107 (Liam's review)

When `pnpm check` runs without rule names, the check command shall leave out the trace check, so the repo checks can run before any test has written a result file.

## Examples

- Given no rule names,
  when the rules to run are chosen,
  then every rule except `trace` is chosen.
- Given the rule name `trace`,
  when the rules to run are chosen,
  then only `trace` is chosen.
