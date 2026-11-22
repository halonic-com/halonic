# Decision: halonic routines' not-live lines read as Halonic Studio says them

- Task: HAL-15504
- Approval: HAL-15504; team wording on approved command output (HAL-2282), from the words check C588 (rows 22 to 25); the reviewer signs this note as the CTO
- Kind: user-visible

## What changes

Three lines of `halonic routines` that #4613 (HAL-15204) added get new words:

- The line under the list for a routine whose changes aren't committed: "! Weekly report has
  changes that aren't live yet. Until you commit them, it starts as it was last committed."
  (was "It runs as last committed until you commit them.").
- The end of the line when git can't start: "This list can't show which routines have changes
  that aren't live yet." (was "So the list doesn't say which changes aren't live yet.").
- The list's last line: "Routines start on time only while this workspace is open in Halonic
  Studio or `halonic routines watch` is running." (was "… while `halonic routines watch` is
  running or the Studio is open.").

The requirement `cli.commands.routines.list` and its examples say the new words, its two golden
files take the new last line, and the tests expect the new lines. The changeset of #4613 says
"while the workspace is open in Halonic Studio". No test was weakened or skipped.

## Why

C588 found that "runs as last committed" reads clipped, and a routine starts something; that two
sentences in a row started with "so" when git can't start; and that no screen says "the Studio".
In a terminal plain "Halonic" is ambiguous, so the line says "Halonic Studio", as the approved
allow-address error does, and it says "this workspace", because the Studio starts only the open
workspace's routines (`studio.engine-routines`).

## Covers

- cli.commands.routines.list
- apps/cli/src/commands/routines/golden/acme-routines.txt
- apps/cli/src/commands/routines/golden/acme-routines-two-hubs.txt
