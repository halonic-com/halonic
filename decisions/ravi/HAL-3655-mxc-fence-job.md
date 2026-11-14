# Decision: a required MXC fence job on Windows 11 Arm in CI

- Task: HAL-3655
- Approval: Liam approves this note in review on the review task of HAL-3655
- Kind: internal
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:wA2TDbHhN0BZhDIC5BktkYPvGsLkxjkcQgzQ7u7CE81kKMj4YQRU8mu56nvtwWi5HjbYOOUVcjkt6P+pWhp1Cw==

## What changes

`.github/workflows/ci.yml` gets a new job, `sandbox-mxc-fence` ("Sandbox fence (MXC on Windows 11)"),
on `windows-11-arm`, and `ci-ok` now needs it, with no `continue-on-error`. It runs the `test:fence`
script of `@halonicjs/adapter-sandbox-mxc` (contract suite, fence proof, attack cases); a missing
package or script fails the job. A new `sandbox-mxc` changed area decides when it runs: the adapter,
the sandbox choice in `core/app`, `packages/core/ports/`, `ci.yml`, `.github/actions/` and
`pnpm-lock.yaml`.

Triggers, rights and secrets don't change: `contents: read`, no secrets, nothing uploaded.

## Why

MXC is opt-in, but a person can switch it on in v0.1, so its fence must block from day one (HAL-3645).

## Tests

No test was weakened or skipped. The job is new and required.

## Covers

- .github/
