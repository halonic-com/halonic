# workflows.tests.page

- Status: draft
- Since: unreleased
- Source: HAL-9993 (T7 PR 5); flow-workflows 6.1; microcopy 9.5; states F11 to F15, F18; UX checklist 3.6

When a workflow's Tests page opens, the workflows feature shall show the summary ("2 of 3 pass · 10:42", or "3 tests, not run yet"), **Run tests** and one row per test with a ✓ or ✕, and for a failed test its sentence and **Open run**; while the tests run, the button shall read "Running…" and be busy, each row still to come shall show a still dot, and the summary shall count up ("1 of 3 done") with no time and shall not be a live region, so only the result toast is announced; with no tests it shall show only the Empty state, without **Run tests**; when the tests can't run it shall show a toast "Couldn't run the tests: *reason*" with **Try again**; while the tests load it shall show a skeleton and "Loading *name*'s tests"; when they can't be read it shall say "Couldn't load *name*'s tests", the reason and **Try again**; and picking a test shall dock its card at the right with the kind label "TEST" over its name, its input, where it ends, and for a failed test its sentence in a danger Callout with **Open run**, and both paths marked from the first difference.

## Examples

- Given three tests of which one failed, then the summary reads "2 of 3 pass" and the failed row shows why and **Open run**.
- Given the person presses **Run tests** and one result has come in, then the summary reads "1 of 3 done" and the other rows show a still dot.
- Given the expected path `read, classify, archive` and the run's `read, classify, reply`, then the card says `It went another way at step 3: "reply" instead of "archive".`
- Given the expected path `read, classify` and the run's `read, classify, reply`, then the card says `It kept going after the expected end, at step 3: "reply".`
- Given the summary changes from "1 of 3 done" to "2 of 3 done", then nothing is announced: only the result toast is.
- Given no tests, then the page has the Empty state and no **Run tests**.
- Given the host can't run the tests, then a danger toast says so and **Try again** runs them again.
