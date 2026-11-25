# format.tool-reviewer-rules

- Status: active
- Since: unreleased
- Source: HAL-18292, PR 1 of HAL-18289 (Liam's review of the proposal): reviewer path rules name roles, not people, and hold exact regexes, not labels

When a tool file running `github.pull-request` gives `reviewerRules`, the format shall accept, per repository, a `default` and an `escalateTo` role, `files`, `folders`, `words`, `wordsSkip` regexes, an optional `lineLimit` with `max` and `skip` regexes, and `nestedPackageJson`; and it shall refuse the file when the rules name a role other than `second-reviewer` or `code-reviewer`, hold a regex that doesn't compile, name a repository outside the tool's `repositories`, or hold a key it doesn't know.

## Examples

- Given rules for `acme/website` with `default: second-reviewer`, `escalateTo: code-reviewer` and `wordsSkip: ['(^|/)(test|tests)/']`,
  when the workspace is checked,
  then the tool file is accepted.
- Given rules whose `escalateTo` is `liam`,
  when the workspace is checked,
  then the tool file is refused: the rules name roles, never people.
- Given rules with `wordsSkip: ['(unclosed']`,
  when the workspace is checked,
  then the tool file is refused at that regex.
- Given a tool reading `acme/website` with rules for `acme/other`,
  when the workspace is checked,
  then the tool file is refused.
