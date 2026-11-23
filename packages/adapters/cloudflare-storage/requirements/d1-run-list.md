# cloudflare-storage.d1-run-list

- Status: active
- Since: unreleased
- Source: HAL-6796; `RunStore` port v1 (the list may lag the log); build plan part 6 on HAL-197; design review HAL-6790 (Elena, 12 Nov); scoped D1 (HAL-13216)

The D1 run list shall keep one row per run, replace a run's row only with a summary of a later event than the row holds, so that repeating an update or applying an older one after a newer one changes nothing, and give the summaries that match every filter field, newest start first, as the `RunStore` port says. Run ids shall be compared as written, so two ids that differ in case are two runs. Every list shall be built with a scope, and lists of different scopes shall share one database without seeing each other's runs, even when one scope is the start of another. Each row shall say who started the run and who may see it: under a user's scope `u/<id>`, the user `<id>` started it; under any other scope, nobody is named yet; and every run is `private`. Filter values shall reach D1 only as bound parameters, never as part of the SQL.

## Examples

- Given a row for run `r1` at event 5,
  when an update for event 3 arrives late,
  then the row still shows event 5.
- Given a row for run `r1` at event 5,
  when the update for event 5 is applied again,
  then nothing changes.
- Given a hub id of `x' OR '1'='1`,
  when the list is filtered by it,
  then it gives no run, and the table is unchanged.
- Given a run published under the scope `u/eu_a`,
  when its row is read,
  then it names `eu_a` as the one who started it, and is `private`.
