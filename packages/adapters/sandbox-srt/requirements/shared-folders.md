# sandbox-srt.shared-folders

- Status: active
- Since: 0.1.0
- Source: HAL-6147 (security review W1 on HAL-5407, for `srt-wsl` in HAL-5396; ruling on HAL-6147)

The sandbox-srt adapter shall deny each session reads of every shared folder it was given (in Halonic's WSL distro: the `halonic` user's home with every project, Halonic's data and each harness's sign-ins, the Windows-drive project mounts in `/mnt/halonic` and `/mnt/wsl`) as a whole, re-allowing only the session's own working, temp and settings folders and its read-only paths inside it, so that a folder made in a shared folder while the session runs stays hidden from it. When a shared folder is missing or isn't a folder, the session shall not open.

## Examples

- Given the projects `a` and `b` in the shared home's `projects` folder and a session working in `a`,
  when a program in the session reads a file in `b`,
  then it gets nothing, and the same file in `a` it reads and can change.
- Given a session working in `a`,
  when project `c` is made in the shared home, or an import's folder in `/mnt/halonic`, after the session opened,
  then a program in the session can neither read nor list it.
- Given a session whose temp and settings folders are in Halonic's data folder in the home,
  when the session opens,
  then those two folders are readable and writable, and the data folder's other entries are hidden.
- Given a shared folder that isn't there,
  when the session opens,
  then it doesn't open: srt would leave the deny out, and a folder made there later would be readable.
- Given a session in a shared folder,
  when a program reads `/proc/self/mountinfo`,
  then it sees the names of the mount points, such as its own project's path (an accepted residual, HAL-6147).
