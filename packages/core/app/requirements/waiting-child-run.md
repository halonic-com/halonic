# app.waiting-child-run

- Status: active
- Since: unreleased
- Source: HAL-15951 (C656 #1 on HAL-15937: a run waiting on its child's approval gave no next step; the parent's lines carry the child's waiting lines, a team decision under HAL-2282)

When a waiting run waits because a child run it started waits (its `run.waiting` names that `child`), the run history shall give the run the person's answer goes to, with its whole log: that child run, or, when the child in turn waits on a child of its own, the run at the end of that line, up to 8 runs deep. A run that doesn't wait on a child shall give none, and so shall a line of runs where a log is gone or that goes deeper than 8 runs.

## Examples

- Given a run of Triage waiting in its step Reply on the child run of Support reply, which waits for approve or reject,
  when the run history reads its waiting child,
  then it gives that child run and its log.
- Given that child run waiting in turn on a child run of its own,
  when the run history reads the waiting child of the run of Triage,
  then it gives the child's child.
- Given a run waiting at its own wait step,
  when the run history reads its waiting child,
  then it gives none.
- Given a run waiting on a child run whose log is gone,
  when the run history reads its waiting child,
  then it gives none.
