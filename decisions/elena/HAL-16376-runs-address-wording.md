# Decision: C699 row 9 words for the halonic runs row of a run waiting on Allow this address?

- Task: HAL-16376, from the words check C699 row 9 on #5181 (HAL-16321)
- Approval: https://paperclip.halonic.com/HAL/issues/HAL-16376 (a wording fix in command output, so a team decision under the HAL-2282 rule; the reviewer's code review signs this note)
- Kind: user-visible

## What changes

- `cli.commands.runs.list-address-question` (edited): the `halonic runs` row of a run waiting on Allow this address? reads `Waiting for your answer to "Allow this address?" in Studio, in the step Draft a reply`, in place of `Waiting for your answer in Studio: "Allow this address?" in the step Draft a reply`. The requirement now says the row names the dialog and Studio as `halonic runs show` does, since the words are no longer the same. The example, both tests and the `apps/cli/README.md` row follow. Nothing else in the requirement changes, and no test is weakened.

## Why

After the colon, "in the step …" read as if the step were part of the question. "Your answer to …" is how the README, the docs and the requirement already describe it. The line hasn't been released yet, so there is no changeset.

## Covers

- cli.commands.runs.list-address-question
