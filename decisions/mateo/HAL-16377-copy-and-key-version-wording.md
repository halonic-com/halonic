# Decision: the different-source line says "this copy", and the data-key version error says the secret can't be opened

- Task: HAL-16377
- Approval: HAL-16377 asks for this wording (C699 rows 12 and 18 on HAL-16368); small wording on an approved screen, so the team decides (HAL-2282); Liam reviews the pull request and signs this note as the CTO
- Kind: user-visible

## What changes

- `cli.commands.plugin.add-update-source`: the line before the trust check now ends "Its settings, secrets and sign-ins carry over to this copy." Before, it said "to the new copy", while the help line and both already-added fixes of the same command say "this copy" (#5183). Only the wording changes; the line shows in the same cases.

## Why

C699 row 12 found the same command naming the copy two ways. Row 18 (no requirement) is in the same pull request: `openSecret`'s version error now reads "<name> was sealed with version 2 of this user's data key, not version 3, so it can't be opened.", to match the error next to it ("… is damaged or isn't this user's, so it can't be opened."). Both lines are new since 0.1.0, so no released wording changes.

## Tests

No test was skipped or weakened. `add-update.test.ts` and `envelope.test.ts` expect the new words in place of the old ones; what they check is otherwise the same.

## Covers

- cli.commands.plugin.add-update-source
