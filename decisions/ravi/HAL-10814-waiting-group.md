# Decision: the gate that turns approvals off is a test-only export

- Task: HAL-10814
- Approval: HAL-10814
- Kind: internal
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:GEpxeOSSX+8qXott50xgQsFDAaHvroW7X9LnI8/MsVxIC4uYquWFFGwJQ0rGf7Y0oQGUtIRGyXkEZhU9TPNFAw==

## What changes

- `tooling/check/policy.json`: `extraExports` for `@halonicjs/engine` now lists `./testing`.

## Why

The gate that turns approvals off moves to the engine's `./testing` export, so only tests can reach it. A
host can't pick it by accident.

## Tests

No test was weakened or removed.

## Covers

- tooling/check/policy.json
- cli.listed-tool-approval
- library.refusals-feed
- library.status-section
