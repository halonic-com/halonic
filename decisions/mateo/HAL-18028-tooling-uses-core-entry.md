# Decision: list `@halonicjs/tooling-paperclip` under `toolingUsesCore`

- Task: HAL-18028
- Approval: Liam decided on HAL-18009 (option 1) that the Agent tools plugin may embed the Halonic engine through a `toolingUsesCore` exception in the layer table; HAL-18010 added the field, this task sets it
- Kind: user-visible
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:MWKVLDCnKBsaWc8y2F47xvunDGaYavm1Z/BuQIUX3dPDmLBR3hX/T83i2MpVD4kScE4ql5q4nu2mJfRZx1epBw==

## What changes

- `tooling/check/policy.json`: `toolingUsesCore` lists `@halonicjs/tooling-paperclip`, after
  `adapterGateways`. Nothing else changes. The field is a trust root like `apiTypes`, so this
  note is `user-visible` and needs both guardians' signatures.

## Why

HAL-18010 (#5836) added the field but left it unset, because CI checks a pull request with the
base's copy of `tooling/check`, which refused a key it didn't know yet. With #5836 on `main`, the
entry can land. After it, HAL-17774 can make `tooling/paperclip` depend on core packages for the
Agent tools plugin's workflow host.

## Security

Only `tooling/paperclip` gets the exception, and only towards core packages, which have no
third-party code and no Node APIs. Adapters, targets and Studio packages stay forbidden for it.
Tooling never ships. The `packages` check fails if the entry stops naming a real tooling package.

## Covers

- tooling/check/
- tooling/check/policy.json
