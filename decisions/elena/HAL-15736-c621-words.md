# Decision: serve's skipped line says "previous run", and the routines README row covers webhook routines

- Task: HAL-15736
- Approval: https://paperclip.halonic.com/HAL/issues/HAL-15736 (words check C621 rows 47, 51 and 33 on HAL-15726; small wording on approved CLI output and docs, decided by the team under HAL-2282, no board card); the reviewer signs this note with the pull request
- Kind: user-visible
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:dcL7D/uzU53jR4+6Usw3kZdtpotVUZZsH53sQo4WTEmrlb1yPPt/4oK8G1qwvJ7+A64pPR81e344PQA+3MwgAg==

## What changes

1. `halonic serve`'s line for a signed web request that started nothing because the routine's previous run is still
   going now says "Weekly report skipped a web request: its previous run is still going (overlap: skip)." It said
   "…: a run of it is still going, and its overlap is skip.", where "a run of it" is awkward and "its overlap is skip"
   reads as a sentence about a word. Studio's busy rule says "If the previous run is still busy · Skip this run", so
   "previous run" ties the two, and the key in brackets shows where it's set. The requirement and the quote in
   `decisions/elena/HAL-15397-serve-routine-cant-start.md` (item 4) change with it; that note is edited only there.
   The line hasn't been released, so there is no changeset for it.
2. The CLI README's `halonic routines` row now says that a webhook routine `halonic serve` says can't start also shows
   "✕ Can't start", is counted by "! 1 routine can't start on a web request · halonic serve", and makes the command
   exit 1, as `cli.commands.routines.list` already says.
3. The changeset `help-first-run.md` now reads "In the Help menu, above Settings in the sidebar, First run now has
   Show the guide, which …, and Start over, which …", so "First run: Show the guide" no longer reads as one item's name.

No test is weakened: the serve test checks the new line in full.

## Covers

- cli.commands.serve.webhook-refusals
- decisions/elena/HAL-15397-serve-routine-cant-start.md
