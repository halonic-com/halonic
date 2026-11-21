# agent-host.sweep-lock

- Status: active
- Since: unreleased
- Source: HAL-6256; HAL-7302 (left-over bridge folders); HAL-5404 (S2, the removal's mark)

When the agent host starts to serve with a profile folder, the agent host shall take the host lock in that profile and hold it until it stops, and only while it holds the lock shall it sweep the kept Windows grants inside each folder given with `--sweep-root`, starting the sweep right after it takes the lock; only while it holds the lock shall it give its sandbox the mark a removal with administrator rights leaves in the profile (`sandbox-srt.forget-after-admin-removal`), and a `--sandbox-remove` with a profile folder shall get that mark's place too. On Linux and macOS, while it holds the lock and before it serves, it shall also remove the run folders in the profile's `bridges` folder that bridges left behind (`harness-bridge.socket-sweep`), and when that fails it shall say why on standard error and serve all the same. If another live host holds the lock, or the lock can't be taken, then the agent host shall serve without a sweep and, when it was given a sweep root, say why on standard error. If a `--sweep-root` has no value or a relative one, then the agent host shall refuse to start, with exit code 2.

## Examples

- Given two `--sweep-root` folders and a profile whose lock is free,
  when the host serves,
  then it holds the lock, starts the sweep of both folders, gives its sandbox the mark's place, and removes the lock when its input closes.
- Given a profile whose `bridges` folder holds a run folder a crashed host left,
  when a host on Linux or macOS takes the lock and serves,
  then the run folder is gone before its handshake.
- Given a profile whose lock another live host holds,
  when a second host serves with a `--sweep-root`,
  then it serves with no sweep root and without the mark's place, says on standard error that it doesn't sweep, and leaves the `bridges` folder as it is.
- Given a profile folder,
  when the host runs `--sandbox-remove`,
  then its sandbox gets the mark's place in that profile.
- Given no profile folder,
  when the host serves,
  then it takes no lock and sweeps nothing.
- Given `--sweep-root runs`,
  when the host starts,
  then it exits with 2 and says that each `--sweep-root` needs an absolute folder.
