# format.schema-problem-limit

- Status: active
- Since: unreleased
- Source: HAL-16339

When `parseFile` finds more than 100 schema problems in one file, it shall report the first 100, worded as `format.missing-key-words` says, and one more problem with the code `too-many-problems` at the top of the file, saying `This file has <n> more problems. Fix the ones above, then check it again.`, where `<n>` is how many it left out, or `This file has 1 more problem. Fix the ones above, then check it again.` when it left out one. The wording of a file's schema problems shall take time linear in their number, so a file with very many of them is reported, not stalled on.

## Examples

- Given an agent with 150 fields it doesn't allow,
  when it is parsed,
  then it fails with 101 problems: one for each of the first 100 fields, and a `too-many-problems` problem that says `This file has 50 more problems. Fix the ones above, then check it again.`.
- Given an agent with 101 such fields,
  when it is parsed,
  then its last problem is `too-many-problems` and says `This file has 1 more problem. Fix the ones above, then check it again.`.
- Given an agent with 100 such fields,
  when it is parsed,
  then it fails with 100 problems and none of them is `too-many-problems`.
