# Decision: the doctor Windows drive example links to docs.halonic.dev

- Task: HAL-6870
- Approval: Liam approves this note in review on [HAL-6870](/HAL/issues/HAL-6870)
- Kind: internal

## What changes

One line in the example of `apps/cli/requirements/doctor-windows-drive.md`: `More: https://docs.halonic.com/sandbox#wsl2-folder` becomes `More: https://docs.halonic.dev/sandbox#wsl2-folder`. The requirement's rule text doesn't change.

## Why

The CLI already prints `docs.halonic.dev`, and the test in `apps/cli/src/output/doctor-report.test.ts` already expects `.dev`. Only the example still said `.com`, so the requirement and the code disagreed. The fix was taken out of #2009 (HAL-6582) because an edit to an active requirement needs a decision note (plan 9.3). Nothing changes for users.

## Tests

No test changes. The existing doctor report test already checks the `.dev` link.

## Covers

- cli.doctor-windows-drive
