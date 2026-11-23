# Decision: the folder "changed since it was copied", and `runs send` says to answer "Allow this address?" in Studio

- Task: HAL-16616
- Approval: HAL-16616 asks for this wording (C731 rows 46, 49 and 50 on HAL-16608); small wording on an approved screen, so the team decides (HAL-2282); Liam reviews the pull request and signs this note as the CTO
- Kind: user-visible

## What changes

- `cli.commands.plugin.list-source-changed`: the line under a plugin whose folder changed now says "The folder changed since it was copied. To use your changes, run: halonic plugin add <folder> --update". Before, it said "since this copy". The line shows in the same cases.
- `cli.commands.runs.send`: a run whose model call waits for "Allow this address?" is now refused with "it's waiting for your answer to "Allow this address?" in the step <step>, which only Studio asks. Answer it there." Before, it ended "and only Studio asks that." The refusal, its exit code and its fix line are the same.

## Why

C731 row 46: the row above already says "copied from ~/weather on 20 Nov", so "this copy" made the reader work out which copy. Row 49: the person ran a command to answer, so the line ends with what to do instead. Row 50 rewrites the unreleased changeset as three sentences instead of one with four changes. All three lines are new since 0.1.0 (#5195), so no released wording changes.

## Tests

No test was skipped or weakened. `list-source-changed.test.ts` and `send-address.test.ts` expect the new words in place of the old ones; what they check is otherwise the same.

## Covers

- cli.commands.plugin.list-source-changed
- cli.commands.runs.send
