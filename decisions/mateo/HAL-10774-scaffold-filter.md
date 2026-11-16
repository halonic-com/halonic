# Decision: the scaffold job runs Turbo only for what it generates, and the trace check takes a package scope

- Approval: HAL-10774
- Kind: user-visible
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:pa5Y9uk3NNp+GhLvVDqsToq59LSb7dOSnbdjWBNhRD2cGBIyotadH302WmQGxo3CTOepXy5PvxPFcR4OV4kACg==
- Signature: ed25519:sha256:s6QbTuo7EHJ-9JxW-RnqP0pi0Jq_Jkrdog_YTzYt1lI:ZVLz1Jm733qo51+knRYp7qjgTREw96yI1dmIx2yV1LSpd/zu77p1HgFFvvD12sHy6Q1NXi6Z6fbdZAecWyBJBw==

The CI job "Empty package and feature pass every check" scaffolds five `ci-example` packages and ran
`pnpm verify --full` over all 97 packages with no Turbo cache, which took 14-19 minutes. The `turbo`
job already runs every task for the existing packages on each merge-group run and on `main`, so the
scaffold job repeated that work.

It now still runs every cheap whole-repo check, and runs Turbo for the five generated folders, the
packages that read the codegen registry (`@halonicjs/app-studio` and `halonic`), and all their
dependents. `pnpm verify --full` takes `--only <folder>` and `--also <package>` for this, and
`pnpm check trace --package <folder>` limits the trace check to the generated packages. The job is not
conditional on paths, so it always runs in the merge queue. Existing packages are covered by the
`turbo` job. `timeout-minutes` stays at 35 until a few green runs on the new timing.

## Covers

- .github/
- tooling/check/
