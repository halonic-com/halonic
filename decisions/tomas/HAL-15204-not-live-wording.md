# Decision: halonic routines says when a routine's changes aren't live, and that the Studio starts routines too

- Task: HAL-15204
- Approval: HAL-15204; Liam reviewed this pull request and signs this note as the CTO
- Kind: user-visible

## What changes

`halonic routines` now adds a line under the list for each routine whose saved file differs from
the last commit: "! Weekly report has changes that aren't live yet. It runs as last committed until
you commit them." A workspace without history, a routine that was never committed, or a routine
only turned on or off gets no such line. When git can't start, the list still shows, with a line
saying it couldn't check what's live, in `halonic run`'s words for git, and their fix. The list's last line now says routines start on time only
while `halonic routines watch` is running "or the Studio is open".

The requirement `cli.commands.routines.list` is updated to say this, and its two golden files take
the new last line. Tests for the new line are added. No test was weakened or skipped.

## Why

Flow check C548 (HAL-15204): after a saved but uncommitted schedule change, the CLI listed the
routine with no sign that `watch` still runs the committed version, while the Studio says "Changes
not live yet". And since HAL-14205 the Studio starts routines while it is open, so the old last
line contradicted the Studio's "Starts on time while Halonic is open." A team wording decision
built on approved Studio wording and `run`'s line about uncommitted changes (HAL-2282 rule).

## Covers

- cli.commands.routines.list
- apps/cli/src/commands/routines/golden/acme-routines.txt
- apps/cli/src/commands/routines/golden/acme-routines-two-hubs.txt
