# app.ask-approvals-glob-pattern

- Status: active
- Since: unreleased
- Source: HAL-16338

When a run in "no sandbox" ask mode gets a `Glob` call whose `pattern` is absolute, starts from a home folder (`~`) or a drive, holds `..`, or has a brace alternative that starts one of those, the ask policy (`app.ask-approvals`) shall ask a person about it as about any other tool, whatever folder its `path` names: the pattern can match files outside that folder.

## Examples

- Given a `Glob` with `path` the project's `src` folder and `pattern` `**/*.{ts,tsx}`,
  when it comes through ask mode,
  then it runs without asking.
- Given the same `Glob` with `pattern` `../../**/*.env`,
  when it comes through ask mode,
  then a person is asked.
