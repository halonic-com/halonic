# Decision: the sandbox fence jobs also run the local tool attack tests

- Task: HAL-1738, pull request 6 of the plan
- Approval: the task asks for attack tests on the Linux sandbox in CI; Liam approves this note in review on [HAL-6162](/HAL/issues/HAL-6162)
- Kind: internal
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:fSLOJjLRNBdsJzbuXNtFLA222Sj9vwfePzpnhtYlN968H1wrcBAABhzPHnN4z7JWkM88z5ScFeu8jLDPOtV2CQ==

## What changes

In `.github/workflows/ci.yml`, the `sandbox-fence` area now also matches
`packages/adapters/connector-stdio-sandbox/`, and the `sandbox-fence` (bubblewrap) and
`sandbox-fence-macos` (Seatbelt) jobs get one more step: `pnpm test:fence` in
`packages/adapters/connector-stdio-sandbox`. Nothing is removed or relaxed; the existing
`sandbox-srt` fence step runs as before.

## Why

The new tests start a hostile local tool through `connector-stdio-sandbox` in a real
`sandbox-srt` session. They can only pass where the fence starts, which our containers and the
ordinary test jobs aren't, so they run in the jobs that already prepare the fence. Without the
area change, a change to the connector alone would skip them.

## Tests

No test was weakened. Five new tests run in the fence jobs.

## Covers

- .github/
