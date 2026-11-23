# Decision: the served model choice's commit message names `halonic serve`

- Approval: https://paperclip.halonic.com/HAL/issues/HAL-16722 (words check C754 on HAL-16719, row 3, decided by the team under HAL-2282); the reviewer (Liam) approves this note in review
- Kind: user-visible
- Task: HAL-16722

## What changes

`cli.commands.serve.choice-commit` quotes the commit message Continue makes through `halonic serve`.
It changes from "Save the model picked in a served window" to "Save the model picked through
halonic serve". The rest of the requirement stays as it is. The test that verifies it now checks
the exact words instead of the shared constant.

## Why

The words check C754 found that "a served window" means nothing to someone reading the history
later. The command's name says where the commit came from. The requirement is still
`Since: unreleased`, so no released history has the old message.

## Covers

- cli.commands.serve.choice-commit
