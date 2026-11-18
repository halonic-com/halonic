# Decision: on a phone, an overview row's used-by text ends its meta line

- Task: HAL-12666
- Approval: Liam approves this change on HAL-12666 (https://paperclip.halonic.com/HAL/issues/HAL-12666), the designer's call from Sofia's check on HAL-12633 (a11y-check-2 P3). A team decision with no board card (HAL-2282 rule).
- Kind: user-visible

## What changes

On a phone, an overview row with a ⋮ button put its used-by text at the start of the line under
the name, before the detail. On Routines that was the next start time, so "Mondays at 09:00 →
Weekly report" was what got cut. Now a used-by text ends that line after " · ": "Mondays at 09:00
→ Weekly report · next Mon 09:00", and the time is the part that truncates. The chips stay where
they were. The desktop is unchanged. No new words.

The change is local to the shell's overview rows, so it applies to every overview page (Routines,
Agents, Library, Workflows) and not to other lists. A used-by that is a node rather than text
keeps its old place, because the meta line holds text only; no feature passes one today.

The requirement `shell.overview.used-by` says this and gains a phone example; a test for it is
added. No test was weakened or skipped.

## Why

Found in Sofia's high-contrast, zoom and phone check (HAL-12633, row P3): at 320 px only 52 px of
the schedule showed. What the routine does should read first.

## Covers

- shell.overview.used-by
