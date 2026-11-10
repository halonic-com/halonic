# system-node.find-program

- Status: active
- Since: 0.1.0
- Source: HAL-3976, HAL-191; plan phase 3 ("the Windows start path resolving to absolute commands with no shell"). Generalises `git.find-git`.

The Node starters shall start a program only by its absolute path, so the system never searches for a bare name itself. `findProgram` shall find a bare name in the absolute folders of the `PATH`, in their order, and skip an empty or relative folder. On Windows it shall accept only `<name>.exe`, never a `.cmd` or `.bat`, which need a shell, and never search the current folder. It shall check an absolute name and give it back as it is (on Windows only an `.exe`), and never find a relative name with a folder in it, such as `./server` or `C:server`. When nothing is found it shall give back nothing, and the starter refuses.

## Examples

- Given a `PATH` of `bin` and an absolute folder that holds the program,
  when a starter looks for it,
  then it gets the path in the absolute folder.
- Given a Windows `PATH` with an empty entry and `.`, and the program in the current folder,
  when a starter looks for it,
  then nothing is found.
- Given a Windows `PATH` whose only match is `server.cmd`,
  when a starter looks for `server`,
  then nothing is found.
