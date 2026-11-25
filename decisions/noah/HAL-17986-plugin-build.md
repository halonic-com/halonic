# Decision: a new core package for the Paperclip plugin builder

- Approval: Liam approved the new package on HAL-17985 (the HAL-17950 plan for `halonic build paperclip-plugin`, question 1: "`packages/core/plugin-build` is approved"); this step is HAL-17986. It changes `tooling/check/policy.json`, a trust root, so both guardians sign: Julian, then Liam
- Kind: user-visible

## What changes

A new core package, `@halonicjs/plugin-build`, builds a Paperclip plugin's bytes: a reproducible,
uncompressed ustar archive, its sha-256, the release file and the change list. `pnpm new package`
added `@halonicjs/plugin-build` at the end of `coreOrder` in `tooling/check/policy.json`. CI runs
the policy rules from the base commit's copy, so the package lands in two steps
(`docs/guides/checks.md`): this pull request adds the package with no core dependencies and its
smallest real piece, the ustar writer with its name refusals. The rest, which depends on
`@halonicjs/std` and `@halonicjs/schema-kit` (both earlier in `coreOrder`), follows in HAL-18002.
Nothing else in the guard changes.

## Tests

No test is weakened. The package's own tests cover the writer's bytes and its name refusals under
the new requirement `plugin-build.tar-names`.

## Covers

- tooling/check/
