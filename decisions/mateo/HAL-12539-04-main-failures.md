# Decision: a nightly that sorts main's failed jobs into areas and opens one issue per area

- Task: HAL-12539
- Approval: the task asks for this change (HAL-12539, step 3, as Liam decided it on 18 Nov); Liam approves this note in review
- Kind: internal
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:BCBAMb8pV/6X1THKWDpYuVJ7qBNh+9toMR+FviQhlPVW8MRmr4gSNzxrBBQvqj+W6V5t1ZNAikSBtVwdCtXZBQ==

## What changes

- New `tooling/check/src/lib/main-failures.ts` and `tooling/check/src/cli/main-failures.ts`
  with the requirement `check.main-failures`. They read the newest finished push run of
  `ci.yml` on `main` and the newest `android-screens.yml` run, and sort each failed job into an
  area with the tables in `docs/guides/area-owners.md`. A job that tests every package goes to
  the area of the package whose task failed in its log. A job that also failed on the run of
  the night before (at least 20 hours older) is marked "second night in a row".
- In `.github/workflows/scheduled.yml`, the job "Failures on main, by area" in the daily run.
  It opens or updates one issue per failing area (label `nightly:<area>`), closes the issue of
  an area that is green again, then starts `android-screens.yml` for the next night. It needs
  `actions: write` for that start and `issues: write` for the issues. Nothing is installed. If
  it fails, the existing "Scheduled checks failed" issue is opened.
- In `docs/guides/area-owners.md`, the Sandbox row names its two package jobs exactly, and a
  section says what the nightly does.

## Why

Step 3 of staged CI in one `main` (HAL-12539). Every push to `main` already runs the whole
matrix, so a second nightly matrix would test the same code again. What was missing is that
nobody was told when those runs fail. A Paperclip routine turns the open `nightly:*` issues into
tasks for the area owners, because a GitHub workflow can't reach Paperclip.

## Tests

No test was weakened or skipped. The sorting has its own tests, and a replay of a real failed
`main` run (44207980872) sent its failed test job to Studio.

## Covers

- .github/
- tooling/check/
