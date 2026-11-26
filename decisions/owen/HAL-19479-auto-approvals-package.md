# Decision: a new core package for auto approvals

- Approval: Liam confirmed the shadow-mode build plan on HAL-19475, including PR 1's new core package `packages/core/auto-approvals`, from the shadow-mode card the board approved on HAL-19416. It changes `tooling/check/policy.json`, a trust root, so both guardians sign: Julian, then Liam
- Kind: user-visible
- Signature: ed25519:sha256:s6QbTuo7EHJ-9JxW-RnqP0pi0Jq_Jkrdog_YTzYt1lI:acFjJDWkK7yGyCK4Po/uShsRs3vmYS0K1fjktIQI1gsCq3YWEjwkQDWezhP6eIMj1ED0s4kA2lay/CCVW+exCA==

## What changes

A new core package, `@halonicjs/auto-approvals`, made with `pnpm new package core/auto-approvals`.
The generator added it at the end of `coreOrder` in `tooling/check/policy.json`, after
`@halonicjs/std` and `@halonicjs/yaml`, which its card and never-list reader will use. In this
step it depends on no core package and holds only the known values a never-list entry and an
approval card may name. CI runs the policy rules from the base commit's copy, so the card and
the never-list reader follow in a second pull request once this one has merged. Nothing else in
the guard changes.

## Tests

No test is weakened. The package's first test checks that only the listed values are known.

## Covers

- tooling/check/
