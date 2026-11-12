# studio.src-tauri.crates.command-paths.command-lookup

- Status: draft
- Since: 0.1.0
- Source: HAL-7876; `findCommand` in `apps/cli/src/command-paths.ts`

The shell shall find a command as the CLI does: the first program of that name in an absolute folder of `PATH`, as an absolute path, so that no current folder and no relative entry decides which program runs. It shall give no path for an empty command or one that holds a folder separator (`/` or `\`). Where endings are given, as on Windows from `PATHEXT`, it shall try the command with each ending in lower case, or only the command itself when it already ends in one of them, ignoring case. A file that isn't a regular file, or on Unix isn't executable, shall not count.

## Examples

- Given `PATH` holds `/usr/bin` and `/usr/bin/npx` is executable,
  when `npx` is looked up,
  then the path is `/usr/bin/npx`.
- Given `PATH` holds `bin` (relative) and an empty entry, and `bin/npx` exists,
  when `npx` is looked up,
  then there is no path.
- Given the endings `.com`, `.exe`, `.cmd` and `npx.cmd` in a `PATH` folder,
  when `npx` is looked up,
  then the path ends in `npx.cmd`.
- Given `./tool` or `a\tool`,
  when it is looked up,
  then there is no path.
