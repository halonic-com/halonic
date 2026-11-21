# app.in-sandbox-approvals

- Status: active
- Since: unreleased
- Source: HAL-14992, Owen's plan approved with changes by Liam (fence state from the session, fail closed, the tests he listed)

The app shall give a second mode of the ask policy, for an agent whose file says `asks: in-sandbox`, that wraps a run's approvals. While the call's sandbox session reports the fence `fenced`, it shall approve without asking, after recording the call, a read or an edit of Claude Code's own tools whose real path is inside the session's working folder (the folder followed through its links too) and, for an edit, not a protected path, by the ask policy's rules (`app.ask-policy`); a `Bash` command, whatever it says; and `TodoWrite`. It shall pass every other call to the run's approvals unchanged: a path outside the folder, a relative path, `..` that leaves it, a protected path such as `.git` at any depth or `.claude/`, a path that can't be resolved, a device or network path, another MCP server's tool, `Task`, `WebFetch` and any other tool. When there is no session yet, or its fence is `off`, `not-fenced` or `stopped`, it shall pass every call on. When the record can't be written, or the session stops being fenced while a path is resolved, it shall pass the call on. The record shall name the tool and the path, or the command cut at 2,000 characters.

## Examples

- Given a fenced session with the working folder `/data/proposals/run_1`,
  when Claude Code edits `/data/proposals/run_1/src/a.ts` or runs `npm test`,
  then the call is approved without asking, and recorded first.
- Given the same session,
  when it edits `/data/proposals/run_1/.git/config` or `/data/proposals/run_1/../run_2/a.ts`, or writes a new file under a folder that is a link to `~/.ssh`,
  then the run's approvals get the call as it came.
- Given no session, or a session whose fence is `off`, `not-fenced` or `stopped`,
  when Claude Code edits a file in the working folder or runs a command,
  then the run's approvals get the call as it came.
- Given a fenced session whose run log can't take the record,
  when Claude Code runs `ls`,
  then the run's approvals get the call.
