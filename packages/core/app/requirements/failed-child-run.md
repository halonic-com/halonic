# app.failed-child-run

- Status: active
- Since: unreleased
- Source: HAL-15555 (read the child's cause from the child's own log rather than copy it into the parent's event, decided by Liam on the task)

When a run failed in a `workflow` or `foreach` step because a child run it started failed, the run history shall give that child run and its whole log: the last child run whose `workflow.finished` says `failed` in the step the run's `run.failed` names, with the for-each item it ran for. A run that failed with a reason of its own, such as a budget stop or a cancel, and a run whose step failed without a failed child, shall give none, and so shall a child whose log is gone.

## Examples

- Given a run of Topics that failed in the step Each after its run for item 2 failed,
  when the run history reads its failed child,
  then it gives that child run, its log, and item 1 (0-based).
- Given a run that failed in a `workflow` step after the child run it started failed,
  when the run history reads its failed child,
  then it gives that child run and no item.
- Given a run its budget stopped after a child run failed,
  when the run history reads its failed child,
  then it gives none.
- Given a run that failed in a later step than its failed child's,
  when the run history reads its failed child,
  then it gives none.
