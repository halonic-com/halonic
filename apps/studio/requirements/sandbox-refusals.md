# studio.sandbox-refusals

- Status: active
- Since: unreleased
- Source: HAL-4293, HAL-1709, HAL-11190; `inbox.sandbox-row`

The Studio app shall give the Inbox's sandbox row the runs of the open workspace: the summaries of its run history, real and test, and for one run the reason code that its last `run.failed` event gave in `sandboxReason`. It shall read nothing else of a run's log, and a run with no such event, or none with a code, has no reason (the row reads it as `other`). It shall name a run as the card lists it by its routine's name, or by its workflow's name when the routine is gone, never by the routine's key. It shall pass the run history's changes on to the row's listeners.

## Examples

- Given a run failed with `sandboxReason: "bubblewrap-missing"`, then its reason is `bubblewrap-missing`.
- Given a run whose `run.failed` has no `sandboxReason`, then it has no reason.
- Given a run of the routine `support/daily-digest` named "Daily digest", then it is named "Daily digest"; once that routine is gone, it is named by its workflow.
- Given the run history changes, then the row's listeners hear it.
