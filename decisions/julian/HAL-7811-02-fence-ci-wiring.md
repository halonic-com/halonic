# Decision: the sandbox fence jobs also run the harness smoke test

- Approval: Liam asked for this wiring on [HAL-7811](/HAL/issues/HAL-7811) and approves this note as the CTO; `ci.yml` is not a guard trust root, so no second guardian is needed
- Kind: internal
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:OoFMiU0IHRGKckCIgYhgGnlcoT9AMlWc23AUrIKNln4tXr8jhpN7Ee37Mgtk4XC8uUlz5/izmzYb3uwLQHLVBw==
- Task: HAL-7811

## What changes

In `.github/workflows/ci.yml`, both sandbox fence jobs (Linux bubblewrap and macOS Seatbelt) get one
step, `pnpm test:fence` in `apps/cli`. It runs the smoke test from #2357: a stand-in program started
by `openLocalHarnessHost` in the real sandbox. The `sandbox-fence` change filter also matches
`apps/cli/fence/` and `apps/cli/src/local-harness-host*`, so the test runs on the pull request that
adds it and on later changes to the host.

No existing step, filter match or test changes, and no test is skipped or weakened. The jobs hold no
new secret and no new permission.

## Why

The harness host hands a program the real sandbox before harness runs are turned on (HAL-6477).
Without a run on real machines, nothing proves that the profile root stays hidden and that only the
run's own folders are writable. The test fails on purpose where the sandbox can't start, so it can't
run in the normal test job; the fence jobs are where it can.

## Covers

- .github/
