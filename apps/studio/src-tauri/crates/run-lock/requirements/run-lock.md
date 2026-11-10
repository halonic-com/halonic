# studio.src-tauri.crates.run-lock.run-lock

- Status: draft
- Since: 0.1.0
- Source: HAL-2701, HAL-2719, HAL-4063; HAL-2373; `RunLockRecord` in the `RunStore` port

While the shell appends to a run, it shall hold `<runId>.lock`, created with an exclusive create and holding a `RunLockRecord` as JSON written byte for byte as `fs-node` writes it. It shall wait while another live writer holds the lock, remove a stale lock as the port's rules allow and judge every lock in `run-lock-cases.json` as `fs-node` does, remove a stale lock only while holding `<runId>.lock.takeover` and only while the lock still holds the stale record, and remove its own lock once the work has returned or panicked, but only while the lock still holds its own record. On Windows, while taking or removing the lock, it shall treat access denied (error 5) and a sharing violation (error 32) as the lock being busy right now and try the step again for up to 2 seconds before it returns the error (HAL-3871). If the lock's folder is missing, the file system fails, or the lock or its takeover file is a symbolic link to a missing file, then the shell shall return the error without running the work.

## Examples

- Given a fresh lock held by a process that runs on this computer,
  when the shell takes the lock,
  then it waits until the lock is removed.
- Given a fresh lock from this computer whose process no longer runs,
  when the shell takes the lock,
  then it removes the stale lock at once and takes its own.
- Given a fresh lock from another computer,
  when the shell takes the lock,
  then it waits, and removes it only once it is older than 10 seconds.
- Given a stale lock that another writer replaced with a fresh one after the shell read it,
  when the shell removes the stale lock,
  then the fresh lock is left where it is, and no third writer can take the lock.
- Given a stale lock and a takeover file another writer holds,
  when the shell takes the lock,
  then it waits until the takeover file is gone, and removes one older than 5 seconds.
- Given six writers that start at once on a stale lock,
  when they take it,
  then only one is ever inside.
- Given a lock that is a symbolic link to a missing file,
  when the shell takes the lock,
  then it fails with an error that names the link, without running the work.
- Given four writers that each take the lock ten times,
  when they run at once,
  then only one is ever inside, and all forty rounds finish.
- Given a lock another writer is deleting on Windows,
  when the shell takes the lock and Windows denies access,
  then it tries again and takes the lock once the file is gone.
