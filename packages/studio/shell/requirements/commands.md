# shell.commands

- Status: active
- Since: 0.1.0
- Source: HAL-171; plan 5.3

The shell shall let a feature add commands through `commands.add`, search providers through `search.addProvider` and at most one UI state hook through `persist`. The shell shall list commands by id and search providers by `order`, then `id`, each with the feature that added it. The shell shall accept as command and search provider ids only names of letters, digits and dashes, starting with a letter, joined by dots. If two commands or two search providers share an id, an id isn't a valid name, a contribution or `persist` hook isn't a plain object, or a feature calls `persist` twice, then the shell shall throw a `ShellError`.

## Examples

- Given _agents_ adds the command `agents.new`,
  when the commands are listed,
  then `agents.new` is there with the feature `agents`.
- Given _agents_ and _runs_ both add the command `app.refresh`,
  when the shell is created,
  then a `ShellError` naming both features is thrown.
- Given _agents_ calls `persist` and its session saved `{ open: ["reviewer"] }` last time,
  when the workspace opens again,
  then `activate` receives `{ open: ["reviewer"] }`.
- Given _agents_ calls `persist` twice,
  when the shell is created,
  then a `ShellError` is thrown.
