# cli.parity-cli-calls

- Status: active
- Since: 0.1.0
- Source: HAL-5228 (HAL-187 item 9)

When `halonic test` and `halonic run` repeat the old CLI's calls on the base parity fixture (`cli-calls.ts`), each on a fresh copy, from the old fixed time (2026-01-01T00:00:00Z), with IDs counted from 1 and the fixture trusted, each call shall exit as the old call did and store the same runs, with their events in order, as `cli.json` holds, once the CLI rules of the allowed differences are applied. A call that still differs shall be named by a known gap, with the task that fixes it. A rule that changes no call, and a known gap whose call matches, shall fail the check, so neither list keeps an entry that no longer applies.

## Examples

- Given the old `studio run <ws> billing approval --event approve`,
  when `halonic run billing/approval --event approve --dir <ws>` runs,
  then it exits 0 and stores one run whose events equal the old run's, once the run IDs, `definitionsVersion` and the waiting labels and title are left out.
- Given the old `studio run <ws> billing nope`, which exited 1,
  when `halonic run billing/nope` exits 4 for a workflow it can't find,
  then the call is allowed by `exit-codes-by-kind`, and stores no run, as before.
- Given the known gaps that name "run an agent with the echo model",
  when the engine is fixed and the call equals the old one,
  then the check fails until no gap names the call.
