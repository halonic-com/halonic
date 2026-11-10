# fs-node.held-lock

- Status: active
- Since: 0.1.0
- Source: HAL-4032; `RunLockRecord` in the `RunStore` port

The `holdLock` function shall take a lock file for as long as one process holds it, such as the one engine of a workspace, with an exclusive create and a `RunLockRecord` as JSON, as the run store's lock does (`fs-node.run-store-lock`). It shall remove a stale lock as the port's rules allow, and refuse with a `LockHeldError` that names the holder when a live process holds the lock, without waiting. While it holds the lock, it shall renew it every third of `runLockStaleAfterMs`, writing its record again with `takenAt` now and replacing the file whole, so the lock never counts as stale while its holder runs. When the lock doesn't hold its record any more, another process has taken it over: it shall stop renewing and tell the holder the lock is lost. A renewal that fails shall be reported and tried again at the next one. Releasing shall stop the renewals and remove the lock only while it holds its own record.

## Examples

- Given a lock file held by a running process on this computer,
  when `holdLock` is called on it,
  then it fails with a `LockHeldError` that names the process, and the lock is unchanged.
- Given a lock file left by a process that has exited,
  when `holdLock` is called on it,
  then it takes the lock.
- Given a held lock,
  when it is renewed,
  then the file holds this process's record with a later `takenAt`, and releasing it removes the file.
- Given a held lock that another process has taken over,
  when it is renewed,
  then the holder hears that the lock is lost, and releasing it leaves the other process's lock.
