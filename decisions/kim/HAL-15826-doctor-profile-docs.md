# Decision: the doctor Profile line's examples use full paths for HALONIC_HOME

- Task: HAL-15826
- Approval: https://paperclip.halonic.com/HAL/issues/HAL-15826 (found in the C635 docs check, HAL-15822). A team decision with no board card.
- Kind: internal

## What changes

Two examples of `cli.commands.doctor.profile-line` set `HALONIC_HOME` to a
relative path (`./acme/.profile`, `./acme-profile`). The CLI refuses a relative
`HALONIC_HOME` before `doctor` checks anything ("HALONIC_HOME must be a full
path", exit 2), so those examples couldn't give the lines they quote. They now
use full paths, `<home>/acme/.profile` and `<home>/acme-profile`, with
`halonic doctor --dir acme` run in `<home>`. That is what the tests already do,
and a real run on `main` gives exactly the quoted lines.

Wording of the examples only. The rule, the code and the tests don't change.

## Covers

- cli.commands.doctor.profile-line
