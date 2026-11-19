# agent-host.proposal-record-lock

- Status: active
- Since: unreleased
- Source: HAL-6477 (Liam's review of #3826 on HAL-12841); `app.run-proposal-record-lock`

The agent host shall give the run proposal service of each workspace the record lock of its proposal records (`fs-node.proposal-record-lock`), because `halonic proposals` and the CLI's engine open the same records in Halonic's data folder from other processes. While another process holds a run's lock, the host shall open, end or clear that run's folder only once the lock is released.

## Examples

- Given another process holds the record lock of run `run_1`,
  when Studio opens the folder of `run_1`,
  then the folder is opened only after that process has released the lock.
