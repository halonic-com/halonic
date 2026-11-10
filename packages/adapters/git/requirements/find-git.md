# git.find-git

- Status: active
- Since: 0.1.0
- Source: HAL-2607, HAL-191; plan phase 3 ("the Windows start path resolving to absolute commands with no shell")

The git adapter shall start git only by its absolute path, with its arguments as an array and no shell. When no path is given, it shall find git in the absolute folders of the `PATH`, in their order, and skip an empty or relative folder. On Windows it shall accept only `git.exe`, never a `git.cmd` or `git.bat`, which need a shell, and never search the current folder. When no folder has git, it shall refuse with an error that says to install git. It shall refuse a git path that isn't absolute.

## Examples

- Given a `PATH` of `bin` and an absolute folder that holds git,
  when the adapter looks for git,
  then it gives the path in the absolute folder.
- Given a Windows `PATH` whose only git is `git.cmd`,
  when the adapter looks for git,
  then it refuses: git wasn't found.
