# runtime.delete-scope

- Status: active
- Since: unreleased
- Source: selling layer S1-4 (HAL-13216); plan revision 4 and its conditions, approved on HAL-17260
- Known limits: a run's object is found through the scope's run list, so the object of a run whose first alarm hasn't published it to the list yet isn't erased; the operator runs the delete again after a minute, and a user-facing delete waits for a register of a scope's objects (S1-5, HAL-13217).

When the admin route `POST /admin/scopes/delete?scope=` is called with the admin key and a scope read as a session's scope is read, `u/<id>` or `o/<id>`, the Worker shall erase every stored thing of that scope and nothing of another: every run's object the scope's run list names (log, timers, outbox, name prefix and alarm), the scope's coordination and routines objects, every blob under the scope's prefix, its records with the sign-in tokens' collection and their compaction claims, and its run list rows, the run list last; it shall then answer 204. A missing scope, or one that isn't a scope, shall answer 400 `bad_scope` and erase nothing. Running the delete again shall be safe and shall erase what the first run left.

Rationale: a person or an organisation can have all their data deleted, and a delete that stops halfway must be able to finish when it is run again.

## Examples

- Given a run with a timer, a lease, a counter, a blob, a record and a token under `u/eu_a…` and under `u/eu_a…b`, when the first scope is deleted, then each of its stores is empty and the second scope holds all of it; and likewise for two `o/` scopes.
- Given a deleted scope, when it is deleted again, then the delete passes and the scope stays empty.
- Given `POST /admin/scopes/delete` without a scope, with an empty one or with `u/eu_a…/`, then it answers 400 `bad_scope`; with `o/org_a…`, it answers 204 and the scope is empty.
