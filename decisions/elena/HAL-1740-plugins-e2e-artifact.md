# Decision: upload the plugins flow's failure report with the e2e report

- Task: HAL-1740
- Approval: https://paperclip.halonic.com/HAL/issues/HAL-12181#comment-1273ccb2-50d2-49b1-bbb6-e04e1ab6ef56 (Liam approved the plugins test-results path in the failure-only e2e upload)
- Kind: internal
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:G+oFvp9+NOewz/vyhcNh6ESjUNxAyNz46Lr2nwWU4NL2wLgNc90VAMY5Xy4M7sw4Mg1H0MEf6muqpCGa6/zMDQ==

## What changes

In `.github/workflows/ci.yml`, the failure-only `e2e-report` upload in the Studio end-to-end job lists a second path, `packages/studio/features/plugins/test-results`, next to the shell's. No step, check or gate is changed, weakened or skipped.

## Why

When the plugins flow fails, its traces were not uploaded, so a failure left nothing to step through (Liam's review of #3482).

## Covers

- .github/
