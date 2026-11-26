# Decision: a new core package for ToolScript

- Approval: Liam approved the plan for `packages/core/toolscript` on HAL-17567, from the ToolScript ADR on HAL-17560. It changes `tooling/check/policy.json`, a trust root, so both guardians sign: Julian, then Liam
- Kind: user-visible
- Signature: ed25519:sha256:s6QbTuo7EHJ-9JxW-RnqP0pi0Jq_Jkrdog_YTzYt1lI:qWIsPCCss2EKcmR9XQEsdJ0Ivw3DUwYfvtVDCNzPhEMuw3+Ubm7i+kab2GlTvx4/oIY5/8hTeY8SXd7NQcWNBQ==
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:imOC++lDI41HZ50KCIJ2TtxdZ52KKoflM7DVidAHr2t9rn55lKYw1QlZeq2z0jF99tGNXke0Bqij6L/apMLfDw==

## What changes

A new core package, `@halonicjs/toolscript`, made with `pnpm new package core/toolscript`. It is
listed in `coreOrder` in `tooling/check/policy.json` right after `@halonicjs/action-steppers`, which
its header schema will use. In this step it depends on no core package and holds only the format
name. CI runs the policy rules from the base commit's copy, so the header schema, the context types
and the artifact format follow in a second pull request once this one has merged. Nothing else in
the guard changes.

## Tests

No test is weakened. The package's first test checks the format name.

## Covers

- tooling/check/
