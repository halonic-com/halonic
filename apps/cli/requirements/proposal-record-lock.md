# cli.proposal-record-lock

- Status: active
- Since: unreleased
- Source: HAL-6477 (Liam's review of #3747 on HAL-12841)

The CLI shall give the run proposal service of a workspace, in the engine and in `halonic proposals` alike (`localProposalParts`), a record lock (`app.run-proposal-record-lock`): one lock file per run, `<run-id>.lock` in the proposal records' folder in the profile, held with `holdLock` (`fs-node.held-lock`) so it is renewed while a slow decision holds it and the lock of a process that ended is taken over. While another process holds a run's lock, the CLI shall try again every 25 milliseconds for up to 30 seconds and then fail, naming the process that holds it. The lock shall be released once the work under it has settled, whether it succeeded or failed. When the lock was lost while the work ran, the work's result shall not be given: the CLI shall fail, saying another process may have decided the proposal at the same time. The lock is not the engine lock, so `halonic proposals` still works while `halonic routines watch` runs.

## Examples

- Given one process holds the lock of run `01JD8Q`,
  when another takes it,
  then the second waits until the first has released it, then runs its work.
- Given one process holds the lock of run `01JD8Q`,
  when another takes the lock of run `7KQ2MX`,
  then it doesn't wait.
- Given work under the lock of run `01JD8Q` that fails,
  when it has failed,
  then the lock file is gone and the work's error is given.
- Given a lock file of run `01JD8Q` left by a process that has ended,
  when the CLI takes the lock,
  then it takes it over and runs its work.
