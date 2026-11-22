# Decision: halonic routines' not-live lines read as Halonic Studio says them

- Task: HAL-15504
- Approval: HAL-15504; team wording on approved command output (HAL-2282), from the words check C588 (rows 22 to 25); the reviewer signs this note as the CTO
- Kind: user-visible
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:x/M+WFw/wZZvSxZo1exNgGp3f3+CCHQeshKF9cmDqrJTFX/lU+3D5B/hlJWcWQZIo2MPAFWtpD/+tpJ6hQB+DA==

## What changes

These lines of `halonic routines`, which #4613 (HAL-15204), HAL-15664 and HAL-15525 added, get new words:

- The line under the list for a routine whose changes aren't committed: "! Weekly report has
  changes that aren't live yet. Until you commit them, it starts as it was last committed."
  (was "It runs as last committed until you commit them.").
- The end of the line when git can't start: "This list can't show which routines have changes
  that aren't live yet." (was "So the list doesn't say which changes aren't live yet.").
- The list's last line: "Routines start on time only while this workspace is open in Halonic
  Studio or `halonic routines watch` is running." (was "… while `halonic routines watch` is
  running or the Studio is open.").
- The line for saved changes with errors, which HAL-15664 added after this note was first
  written: "… and they have errors (halonic validate). It starts as it was last committed." (was
  "It runs as last committed."), for the same reason as the first line.
- The trust line above the list, from Liam's review of #4741 (HAL-15525): when the trust check
  comes back refused, it names the file and why, in `halonic trust`'s words and with its fix,
  instead of suggesting `halonic trust`, which would refuse too; and it shows only when a row
  says "Paused until trusted", so a webhook routine `halonic serve` won't start, which reads
  "Can't start", no longer brings it on its own. The changeset of #4741 says so too.

The requirement `cli.commands.routines.list` and its examples say the new words, its two golden
files take the new last line, and the tests expect the new lines. `cli.commands.routines.list-live-version`
(#4708, HAL-15479), which quotes the line under the list, says it in the new words too. The changeset of #4613 says
"while the workspace is open in Halonic Studio". No test was weakened or skipped.

## Why

C588 found that "runs as last committed" reads clipped, and a routine starts something; that two
sentences in a row started with "so" when git can't start; and that no screen says "the Studio".
In a terminal plain "Halonic" is ambiguous, so the line says "Halonic Studio", as the approved
allow-address error does, and it says "this workspace", because the Studio starts only the open
workspace's routines (`studio.engine-routines`).

## Covers

- cli.commands.routines.list
- cli.commands.routines.list-live-version
- apps/cli/src/commands/routines/golden/acme-routines.txt
- apps/cli/src/commands/routines/golden/acme-routines-two-hubs.txt
