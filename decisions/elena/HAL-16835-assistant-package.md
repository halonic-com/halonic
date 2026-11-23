# Decision: a new core package for the Build chat's tools

- Approval: Liam approved the package on HAL-16788 (T14 pull request plan, Q1: a new core package `packages/core/assistant`, owner Elena, after `app` in `coreOrder`); this step is HAL-16835. It changes `tooling/check/policy.json`, a trust root, so both guardians sign: Julian, then Liam
- Kind: user-visible

## What changes

A new core package, `@halonicjs/assistant`, will hold the Build chat's tools (`list_files`,
`read_file`, `schema`, `validate`, `propose_file` and `propose_delete`). CI runs the policy
rules from the base commit's copy, so a new core package lands in two steps
(`docs/guides/checks.md`): this pull request adds the package with no core dependencies and
its smallest real piece, the tool result texts with their test. The tools follow in #5423
(HAL-16790), which then depends on `app`, `format`, `ports`, `std` and `workspace`.

`tooling/check/policy.json` adds `@halonicjs/assistant` at the end of `coreOrder`, after
`@halonicjs/app` and the other packages it will use. Nothing else in the guard changes.

## Tests

No test is weakened. The package's own test pins three of the texts.

## Covers

- tooling/check/
