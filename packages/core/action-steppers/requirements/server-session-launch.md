# action-steppers.server-session-launch

- Status: active
- Since: unreleased
- Source: task HAL-17834 and its approved plan, sections 2 to 4; security review on HAL-17837

When the action-steppers package checks the user's server settings, it shall take a host only when it is at most 253 characters of labels of letters, digits and `-`, each starting with a letter or digit, so it never starts with `-` nor holds `@`, `:`, a space or a shell character; a user only when it matches `^[a-z_][a-z0-9_-]{0,31}$`; and a port only when it is a whole number from 1 to 65535. The cases in `src/golden/server-session-cases.json` are shared with the desktop shell's own check. When it renders the launcher for a checked target and task id, the launcher shall hold no path and no brief text: it shall move into its own folder through `$0`, copy `./brief-<task>.md` over ssh's input to `.halonic/briefs/<task>.md` on the server, delete its local files, stop with a message and never start Claude Code when the copy failed, and otherwise run `ssh -t` with `--` before the single destination `user@host`. On the server, `claude` shall start with no flag and only the constant prompt "Read the file .halonic/briefs/<task>.md and follow it.", and the brief shall be deleted when the session ends; the sweep shall delete only `HAL-*.md` files older than 60 minutes directly in that folder. The shell's command for it shall be named by the constant `serverSessionCommand`.

## Examples

- Given the host `-oProxyCommand=sh`, `ops@build.acme.example` or `build;acme`,
  when the settings are checked,
  then they are refused.
- Given the user `-l` or `Ops`,
  when the settings are checked,
  then they are refused.
- Given the invented target `ops@build.acme.example` on port 2222 and the task `HAL-1234`,
  when the launcher is rendered,
  then it equals the golden launcher in `src/golden/server-session-cases.json`.
- Given a brief whose steps hold `'`, `"`, `$(…)`, a backtick, `;` and `-o`,
  when the launcher is rendered,
  then no line of the brief appears in it.
