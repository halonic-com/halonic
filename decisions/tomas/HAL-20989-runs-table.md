# Decision: the Runs page's content pane shows every run in a table while no run is open

- Approval: the board's pick on the Paperclip task HAL-20742 (28 Nov 2026, 09:17 CET, option A for Runs: the table at rest, the canvas for a run), built on HAL-20989
- Kind: user-visible
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:DLVAN1zSG3FXhieIn30kwQ4dmb0CFERr/eaOQRwiIL0x2aaxIAibcvecvuDRwLVRZri+qSwBdqKLuetIi6YqDA==

## What changes

`runs.list-column` said that while no run is open, the content pane says "No run open" with
"Pick a run in the list to see its steps." under it. The board picked the design where that pane
is never empty: it shows every run as a table, with what the list's rows have no room for (the
run's short id, what started it and how long it took). That sentence now points to a new
requirement, `runs.runs-table`, which says what the table holds, and its two examples say the pane
shows the table instead of "No run open". Everything else in `runs.list-column` is unchanged:
Ctrl-click, the narrow window and **Back to Runs** work as before.

The tests of `runs.list-column` that checked the pane said "No run open" now check that it shows
the table; each still checks what it checked before (the pane beside the list, the pane left as it
was after a Ctrl-click, after an agent's row and after **Go to Runs**). No assertion is dropped.
The Workflows feature's browser test of the Runs page (`e2e/runs-page.spec.ts`) waited for
"No run open"; it now waits for the table's "All runs" heading, and clicks the list's row of a run
that the table lists too.

`studio-click-test.places-open` required "No run open" in the wide window. It now requires the
table's heading, "All runs", read from the table's own file; the failure code
`NO_RUNS_WIDE_PAGE` and everything else in the step stay.

## Why

The board's choice on HAL-20742: the pane is never empty, and the runs' details are one look away.
"No run open" no longer exists in the app, so the requirement and the click test must stop asking
for it.

## Covers

- runs.list-column
- studio-click-test.places-open
