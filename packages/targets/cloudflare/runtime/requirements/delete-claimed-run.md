# runtime.delete-claimed-run

- Status: active
- Since: unreleased
- Source: selling layer S1-5 (HAL-13217); the must-fix of HAL-17260 (a run object that never reached the run list survives a scope's delete)

When a run of a scope has been claimed through the scope's run ownership store, and its object written, but the run hasn't published an event to the run list yet, deleting the scope shall erase that run's object and count it among the runs erased. A scope's runtime for a principal shall give the run ownership store of that scope.

Rationale: the run list's `pending` row is written before anything calls a run's object, so the run list is the register of a scope's run objects, and a delete finds every one of them.

## Examples

- Given a run claimed in `o/org_a…` whose log holds events but whose first alarm hasn't run, when the scope is deleted, then it answers `{"runs":1}` and the run's object is empty.
