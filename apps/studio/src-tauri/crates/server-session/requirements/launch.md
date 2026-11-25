# studio.src-tauri.crates.server-session.launch

- Status: draft
- Since: unreleased
- Source: HAL-17843; plan on HAL-17834, sections 2 to 4; security review on HAL-17837

The shell shall take a server only when its host, user and port pass the same rules as `validateServerTarget` in `packages/core/action-steppers`, tested against the shared cases in its `src/golden/server-session-cases.json`, and a task id only when it matches `^HAL-[0-9]{1,7}$`. It shall take a brief only when it is at most 8 KB, holds no control or format character other than a line break or a tab and no line or paragraph separator (the cases under `characters` in the shared file), and its first line is `Task: ` and one address ending in `/HAL/issues/<task>`. It shall write the brief and the launcher into a folder named `server-session` with mode `0700` that is not a link and that no one else may open, each file made new with its mode set as it's made (`0600` for the brief, `0700` for the launcher), refusing a file or a link already in its place, and removing a file an earlier launch left behind first. The launcher shall equal the shared golden launcher, hold no path and no brief text, and work from a folder whose name holds `'`, a space, `&`, `%`, `"` and `^`; when the upload fails it shall remove its files, say so and never start Claude Code. The terminal shall be looked for in `/usr/bin` first (only `/usr/bin/open` on macOS), shall get its fixed arguments (on Linux ending in `/bin/sh`) and the launcher's path as one argument, and no brief text, and shall get only `PATH` and the kept variables of Studio's environment.

## Examples

- Given the host `-oProxyCommand=sh` or the user `-l`,
  when the settings are checked,
  then they are refused.
- Given a brief whose first line names `HAL-12345` for the task `HAL-1234`,
  when it is checked,
  then it is refused.
- Given a link where the brief would go,
  when the brief is written,
  then the write is refused and the link's target is unchanged.
- Given a stand-in `ssh` that fails the upload,
  when the launcher runs,
  then it exits with 1, prints that Claude Code was not started, and `ssh` ran once.
- Given a brief with U+202E (right-to-left override) or a tag character in a step,
  when it is checked,
  then it is refused.
