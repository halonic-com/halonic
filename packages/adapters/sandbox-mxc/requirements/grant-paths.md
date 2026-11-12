# sandbox-mxc.grant-paths

- Status: active
- Since: 0.1.0
- Source: HAL-3305, HAL-3503 (grant rules 1, 2 and 4), ADR 2026-11-10-mxc-sandbox-backend

The sandbox-mxc adapter shall hand MXC every path as a plain absolute Windows path: a drive letter in capitals, backslashes only, `.` and `..` resolved, and no trailing backslash. It shall grant only folders: when a read-only path is a single file, it shall refuse it with a sentence naming the file, and never grant the folder around it instead. It shall never grant a drive root, and shall refuse a path without a drive letter. It shall refuse, not repair, a path that Windows would read as another one: a part ending in a dot or a space, or a `:` after the drive letter. Denied paths may name single files.

## Examples

- Given the read-only path `c:/acme/tools/`,
  when the grants are built,
  then MXC gets `C:\acme\tools`. <!-- leak-guard: allow absolute-path made-up example path -->
- Given a read-only path that is a single file,
  when the grants are built,
  then they are refused, and the file's folder is not granted.
- Given the path `C:\` or `C:/`,
  when the grants are built,
  then they are refused.
- Given the path `C:\acme\..\...`, which Windows reads as `C:\`, <!-- leak-guard: allow absolute-path made-up example path -->
  when the grants are built,
  then they are refused.
- Given a denied path that is a single file inside a readable folder,
  when the grants are built,
  then the file is denied as it is.
