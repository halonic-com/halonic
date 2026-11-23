# coding-tools.search

- Status: active
- Since: unreleased
- Source: HAL-16752 (plan HAL-16737, section 4; Liam's conditions on HAL-16748)

The `search` tool shall find a text, or with `regex` a JavaScript regular expression, in the files of the working folder or of a file or folder in it, optionally ignoring case and only in files whose path matches a `glob`, and give each match as `line:text` under its file's path, with `context` lines (0 to 8, 2 by default) around it as `line-text`. It shall walk the files itself, in name order, and start no program, so no git config in the repo can make it run code. It shall leave out `.git`, `node_modules`, what the `.gitignore` files in the working folder and `.git/info/exclude` ignore, every link, binary files and files over 2 MB. It shall give at most 30 matches per file and 200 in all, cut a line after 300 characters, keep the answer within 24,000 characters, and say when it stopped early. A regular expression that runs longer than one second on a file shall be stopped and refused, and an expression or glob that isn't valid shall be refused.

## Examples

- Given a repo whose `.git/config` sets `core.fsmonitor` to a script,
  when the model searches it,
  then the script never runs.
- Given a `.gitignore` with `dist/`,
  when the model searches for a text that is only in `dist/app.js`,
  then it gets no match.
- Given the regular expression `(a+)+$` and a file with a long run of `a`s and a `!`,
  when the model searches,
  then the call is refused within seconds and the server keeps answering.
