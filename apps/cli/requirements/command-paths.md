# cli.command-paths

- Status: draft
- Since: 0.1.0
- Source: HAL-7876, HAL-7899; `findCommand` in `apps/cli/src/command-paths.ts`

The CLI shall find a command as the studio's shell does (`studio.src-tauri.crates.command-paths.command-lookup`), and give the same path string, because the trust check fingerprints it: the first program of that name in an absolute folder of `PATH`, as an absolute path, so that no current folder and no relative entry decides which program runs. The path shall be the folder as written in `PATH`, a separator, and the command's file name: it shall not tidy away a `//`, `./` or `..` in the folder. It shall give no path for an empty command or one that holds a folder separator (`/` or `\`). Where endings are given, as on Windows from `PATHEXT`, it shall try the command with each ending in lower case, or only the command itself when it already ends in one of them, ignoring case. A file that isn't a regular file, or on Unix has no execute bit at all, shall not count. On Windows, double quotes around a `PATH` entry shall be dropped, and an entry shall count as absolute only with a drive or UNC prefix.

## Examples

- Given `PATH` holds `/usr//bin` and `/usr//bin/npx` is executable,
  when `npx` is looked up,
  then the path is `/usr//bin/npx`.
- Given `PATH` holds `/usr/./bin` and `/usr/./bin/npx` is executable,
  when `npx` is looked up,
  then the path is `/usr/./bin/npx`.
- Given a Windows `PATH` entry written in double quotes that holds `npx.cmd`,
  when `npx` is looked up,
  then the path is the folder without the quotes, a backslash and `npx.cmd`.
- Given `PATH` holds `bin` (relative) and an empty entry, and `bin/npx` exists,
  when `npx` is looked up,
  then there is no path.
