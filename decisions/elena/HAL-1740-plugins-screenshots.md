# Decision: upload the plugin screens' screenshots with the studio screenshots

- Task: HAL-1740
- Approval: Liam approves this change on HAL-1740 (pending: link the approving comment here before signing).
- Kind: internal
- Signature: pending

## What changes

In `.github/workflows/ci.yml`, the `studio-screenshots` upload in the Studio end-to-end job lists a second path, `packages/studio/features/plugins/test-results/screenshots/*.png`, next to the Workflows one. No step, check or gate is changed, weakened or skipped.

## Why

The T16 visual checks of the plugin screens need pictures, and browsers run only in CI. The plugins feature's new `e2e/screenshots.spec.ts` takes 22 of them in its existing `Plugins flow` step; without this path they would not be uploaded.

## Covers

- .github/
