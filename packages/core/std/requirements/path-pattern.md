# std.path-pattern

- Status: active
- Since: unreleased
- Source: HAL-16752 (the coding tools' search reads `.gitignore` itself instead of starting git, HAL-16748)

The path pattern helper shall read an ignore file's lines as Git's `.gitignore` reads them: no pattern for a blank line or a `#` comment, a leading `!` that takes a path back, a trailing `/` that matches only folders, a `\` that takes the next character as it is, and trailing spaces left out unless escaped. A pattern with a `/` before its end shall match from the ignore file's folder, and one without shall match a name at any depth. `*` and `?` shall match within one name only, `[...]` and `[!...]` one character of a set, and `**` any number of folders when it is a whole part of the path. Among the patterns that match a path, the last one shall decide, and when none matches the helper shall say so. A line whose set isn't valid shall give no pattern. It shall use no file system and start no program.

## Examples

- Given the line `*.log`,
  when `logs/today.log` is matched,
  then it matches.
- Given the line `/dist/`,
  when `dist` is matched as a folder and as a file, and `src/dist` as a folder,
  then only the first matches.
- Given the lines `*.log` and `!keep.log`,
  when `keep.log` is checked,
  then it isn't ignored.
