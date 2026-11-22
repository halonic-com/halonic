# Decision: a stale fingerprint for a plugin that stays off here offers "To trust it anyway"

- Approval: the task HAL-16016 asks for this change, from Liam's review of #4971 (HAL-15947). The team decides under the HAL-2282 rule: the words are the ones the same command already uses without a terminal, and Liam signs this note in review.
- Kind: user-visible

## What changes

- `cli.commands.plugin.off-here`: when `halonic plugin add` or `halonic trust --plugin <id>` refuses a `--fingerprint` that isn't current, for a plugin that stays off on this computer once trusted, the fix line reads "Read the list above. To trust it anyway, run: halonic trust --plugin … --yes --fingerprint …" in place of "Read the list above, then run: …". The requirement gains one sentence for it, and the stale-fingerprint example gains its last line.

## Why

#4971 changed the fix line without a terminal, because the warning above it already says trusting won't turn the plugin on, so the command isn't the last step. The stale-fingerprint refusal shows the same check and the same warning, but still offered the plain command. Both refusals now end the same way.

What a run may do doesn't change: nothing is trusted on a stale fingerprint, and the command and its fingerprint are the same as before; only the words in front of it change.

## Tests

No test was weakened or skipped.

- `off-here.test.ts`: the stale-fingerprint test for `trust --plugin` now also expects the new fix line, and a new test expects it for `plugin add --yes --fingerprint` with a stale fingerprint. Both fail on `main`, where the fix line reads "then run".

## Covers

- cli.commands.plugin.off-here
