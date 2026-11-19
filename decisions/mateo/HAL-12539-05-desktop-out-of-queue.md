# Decision: macOS and Windows jobs leave the merge queue; the queue tests the full Linux suite only

- Task: HAL-12539
- Approval: the board decided this on 19 Nov (Timothy, around 20:20 UTC), as a change to HAL-5327; Liam approves this note in review
- Kind: internal

## What changes

- In `.github/workflows/ci.yml`, every job that runs on macOS or Windows skips in a merge
  group: Tauri shell on Windows, Keychain contract on macOS, Sandbox fence (Seatbelt), Sandbox
  fence (MXC on Windows 11), Sandbox packages on macOS and on Windows, Sandbox fence on Windows,
  Windows installer and Windows update. The agent host executable keeps only its Linux leg in a
  merge group.
- `ci-ok` still lists these jobs. A skipped job counts as passed, so they no longer hold up a
  merge group, while a pull request still has to pass them.
- Pull requests run them as before, and every push to `main` still runs all of them.

## Why

The merge queue was waiting hours for runners: the org has 60 concurrent jobs on GitHub Team
and only 5 macOS runners. The board chose to take macOS and Windows out of the queue (a change
to HAL-5327, which had them run in the queue when their paths changed).

A failure on macOS or Windows can now reach `main`. It is still caught: the push run on `main`
runs every job, the daily "Failures on main, by area" job (step 3, HAL-12539-04) opens a
`nightly:<area>` issue for each failed job, and the routine at 06:00 and 15:00 UTC turns it into
a task for the area's owner. The owner fixes or reverts within 2 hours, and two nights in a row
pauses that area's merges. Pull requests keep these jobs, because there they only cost a run
when their paths change, and they are now the last check before `main`.

To undo: delete the `github.event_name != 'merge_group'` conditions and the agent host's
merge-group matrix.

## Tests

No test was weakened or skipped. The jobs themselves are unchanged; only when they run changes.

## Covers

- .github/
