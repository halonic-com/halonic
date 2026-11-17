# studio.src-tauri.crates.run-lock.held-lock

- Status: draft
- Since: unreleased
- Source: HAL-8792, decided on HAL-6602; `holdLock` in `fs-node`; `cli.local-engine-lock`

When the shell holds a lock for as long as it runs, such as the engine lock of a workspace, it shall take the file with an exclusive create, holding a `RunLockRecord` as JSON written byte for byte as `holdLock` of `fs-node` writes it, and never wait for a live holder: it shall refuse the lock and name the holder's record. It shall remove a stale lock as the run lock does, so the lock of a process that has ended is taken over. It shall renew the lock a third of the stale limit apart by writing a new record into a file next to the lock and renaming it over, so no process reads half a record. A lock that no longer holds its own record, or is older than the stale limit, shall be given up and reported as lost, and the shell shall remove its own lock on release only while it still holds its own record.

## Examples

- Given a free lock,
  when the shell holds it,
  then the file holds its own record, and releasing removes the file.
- Given a lock the CLI's engine holds, a live process on this computer,
  when the shell holds it,
  then it is refused with the holder's record, and the file is untouched.
- Given a lock whose process has ended,
  when the shell holds it,
  then it takes the lock over.
- Given a held lock,
  when it renews,
  then the file holds a new record and no other file is left behind.
- Given a held lock that another process took over,
  when it renews,
  then it reports the lock lost and releasing leaves the other process's lock where it is.
- Given a held lock that wasn't renewed for longer than the stale limit,
  when it renews,
  then it removes the lock and reports it lost.
