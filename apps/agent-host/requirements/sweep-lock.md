# agent-host.sweep-lock

- Status: active
- Since: 0.1.0
- Source: HAL-6256

When the agent host starts to serve with a profile folder, the agent host shall take the host lock in that profile and hold it until it stops, and only while it holds the lock shall it sweep the kept Windows grants inside each folder given with `--sweep-root`, starting the sweep right after it takes the lock. If another live host holds the lock, or the lock can't be taken, then the agent host shall serve without a sweep and, when it was given a sweep root, say why on standard error. If a `--sweep-root` has no value or a relative one, then the agent host shall refuse to start, with exit code 2.

## Examples

- Given two `--sweep-root` folders and a profile whose lock is free,
  when the host serves,
  then it holds the lock, starts the sweep of both folders, and removes the lock when its input closes.
- Given a profile whose lock another live host holds,
  when a second host serves with a `--sweep-root`,
  then it serves with no sweep root and says on standard error that it doesn't sweep.
- Given no profile folder,
  when the host serves,
  then it takes no lock and sweeps nothing.
- Given `--sweep-root runs`,
  when the host starts,
  then it exits with 2 and says that each `--sweep-root` needs an absolute folder.
