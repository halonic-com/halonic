# Decision: the gate that turns approvals off is a test-only export

- Task: HAL-10814
- Approval: [HAL-10814](/HAL/issues/HAL-10814)
- Kind: internal
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:WlCq5FD0icrSCXOG2W+IfxJL1VusruqkbzaKq/kqDELa8rv4oanbgYPSWw4nIEKqhKhoQQu33qwkAiURsdyRAA==

## What changes

- `tooling/check/policy.json`: `extraExports` for `@halonicjs/engine` now lists `./testing`.

## Why

The gate that turns approvals off moves to the engine's `./testing` export, so only tests can reach it. A
host can't pick it by accident.

## Tests

No test was weakened or removed.

## Covers

- tooling/check/policy.json
