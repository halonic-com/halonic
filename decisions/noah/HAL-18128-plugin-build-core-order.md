# Decision: `@halonicjs/plugin-build` comes before `@halonicjs/app` in `coreOrder`

- Task: HAL-18128
- Approval: Liam approved `@halonicjs/plugin-build` as a core package on HAL-17985 (the HAL-17950 plan for `halonic build paperclip-plugin`), and that plan puts the command's service in `@halonicjs/app`, which needs this order. It changes `tooling/check/policy.json` outside `extraExports`, a trust root, so both guardians sign: Julian, then Liam
- Kind: user-visible

## What changes

- `tooling/check/policy.json`: `@halonicjs/plugin-build` moves from the end of `coreOrder` to just
  before `@halonicjs/app`, after `@halonicjs/workspace`. Nothing else changes.

## Why

#5924 (HAL-17950) adds `buildWorkspacePlugin` to `@halonicjs/app`, and that service uses
`@halonicjs/plugin-build`. A core package may use only core packages listed before it, and CI's
`Policy rules (base commit's copy)` job reads `main`'s `policy.json`, so the new order lands on
`main` first, on its own.

## Security

The `layers` rule stays as strict as before: only the order changes. `@halonicjs/plugin-build`
uses `@halonicjs/std` and `@halonicjs/schema-kit`, both still before it. No package between its
new place and its old one uses it today, and from its new place it can no longer use any of them
(`app`, `engine`, `oauth-sign-in`, `google-setup`, `test-runner`, `words`, `assistant`,
`openui-lang`), which narrows what it may reach.

## Tests

No test or requirement changes. `pnpm check layers` passes with the new order.

## Covers

- tooling/check/
- tooling/check/policy.json
