# Decision: upload the plugin screens' screenshots with the studio screenshots

- Task: HAL-1740
- Approval: https://paperclip.halonic.com/HAL/issues/HAL-12251#comment-00271915-7da5-40c7-87b8-10ba46aecdb5 (Liam approved the plugins screenshots path in the studio-screenshots upload)
- Kind: internal

## What changes

In `.github/workflows/ci.yml`, the `studio-screenshots` upload in the Studio end-to-end job lists a second path, `packages/studio/features/plugins/test-results/screenshots/*.png`, next to the Workflows one. No step, check or gate is changed, weakened or skipped.

## Why

The T16 visual checks of the plugin screens need pictures, and browsers run only in CI. The plugins feature's new `e2e/screenshots.spec.ts` takes 22 of them in its existing `Plugins flow` step; without this path they would not be uploaded.

## Covers

- .github/
