# Decision: upload the plugins flow's failure report with the e2e report

- Task: HAL-1740
- Approval: (Liam's approval link goes here, requested on HAL-1740)
- Kind: internal

## What changes

In `.github/workflows/ci.yml`, the failure-only `e2e-report` upload in the Studio end-to-end job lists a second path, `packages/studio/features/plugins/test-results`, next to the shell's. No step, check or gate is changed, weakened or skipped.

## Why

When the plugins flow fails, its traces were not uploaded, so a failure left nothing to step through (Liam's review of #3482).

## Covers

- .github/
