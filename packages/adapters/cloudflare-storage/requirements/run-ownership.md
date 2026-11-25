# cloudflare-storage.run-ownership

- Status: active
- Since: unreleased
- Source: selling layer S1-5 (HAL-13217); design 13.4 (a run belongs to whoever started it); the must-fix of HAL-17260 (the run list names every run object)

When a run id is claimed in a scope, the D1 run ownership store shall write the run's row in that scope's run list, with status `pending`, the claimed starter and visibility, unless the scope already has a row for the id, and shall give the starter and visibility now stored. No later claim and no published summary shall change a row's starter or visibility. Reading a run's owner shall give `null` for an id the scope has no row for, or whose row names nobody. The run list's `list` and `metadata` shall leave out a `pending` row, and its `runIds` shall give every run id of the scope, `pending` rows included. A claim in one scope shall not be seen from another.

Rationale: the row is written before anything calls the run's object, so the run list is the register of a scope's run objects, and deleting the scope finds even a run that never published an event; and who started a run is written once, so no later start can take a run over.

## Examples

- Given no row for `r1` in `o/org_a`, when `eu_a` claims it, then the claim gives `eu_a`, `private`; `list` and `metadata` are empty and `runIds` gives `r1`.
- Given that claim, when `eu_b` claims `r1`, then it gives `eu_a`; and once `r1` publishes its first summary, `list` gives it and its owner is still `eu_a`.
- Given that claim, when the owner of `r1` is read in `o/org_ab`, then it is `null`, and `eu_b` can claim `r1` there.
- Given an organisation's run published before starters were recorded, then its owner reads as `null`.
