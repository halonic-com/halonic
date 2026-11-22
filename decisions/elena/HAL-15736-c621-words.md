# Decision: serve's skipped line says "previous run", and the routines README row covers webhook routines

- Task: HAL-15736
- Approval: https://paperclip.halonic.com/HAL/issues/HAL-15736 (words check C621 rows 47, 51 and 33 on HAL-15726; small wording on approved CLI output and docs, decided by the team under HAL-2282, no board card); the reviewer signs this note with the pull request
- Kind: user-visible
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:J5nKgmqtIGZaqtcrZVRW4Bdtz4aMla3lJE9Wvcyf1HEc8luX1JPcGaI03ZXbCbg6rR9Of+XvUAm1aIQ/Fy2HAQ==

## What changes

1. `halonic serve`'s line for a signed web request that started nothing because the routine's previous run is still
   going now says "Weekly report skipped a web request: its previous run is still going (overlap: skip)." It said
   "…: a run of it is still going, and its overlap is skip.", where "a run of it" is awkward and "its overlap is skip"
   reads as a sentence about a word. Studio's busy rule says "If the previous run is still busy · Skip this run", so
   "previous run" ties the two, and the key in brackets shows where it's set. The requirement and the quote in
   `decisions/elena/HAL-15397-serve-routine-cant-start.md` (item 4) change with it; that note is edited only there.
   The line hasn't been released, so there is no changeset for it.
2. The CLI README's `halonic routines` row: `main` already says that a webhook routine `halonic serve` says can't
   start shows "✕ Can't start", is counted on its own line and makes the command exit 1, as C621 row 51 asked, so this
   pull request keeps `main`'s row and only says "has a name Halonic keeps" for "has a Halonic name". The README's
   `halonic serve` row quotes the skipped line of item 1 in its new words.
3. C621 row 33, the changeset `help-first-run.md`, isn't changed here: #4733 already rewrote it on `main`, and its
   words no longer read as one item called "First run: Show the guide".

No test is weakened: the serve test checks the new line in full.

## Covers

- cli.commands.serve.webhook-refusals
- decisions/elena/HAL-15397-serve-routine-cant-start.md
