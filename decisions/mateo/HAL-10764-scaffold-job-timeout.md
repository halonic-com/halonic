# Decision: the scaffold job in CI gets 35 minutes instead of 20

- Task: HAL-10764 (follow-up to HAL-10702: #3063 was dropped from the merge queue)
- Approval: the task asks for this change; Liam reviews it and signs this note as the CTO
- Kind: internal

## What changes

The merge-group job "Empty package and feature pass every check" in `.github/workflows/ci.yml` gets `timeout-minutes: 35` instead of 20.

## Why

The job runs `pnpm verify --full` on five scaffolded packages. On 16 Nov, #3066 passed in 19 minutes and #3063 was cancelled at the 20-minute limit (run 43804809643), which dropped it from the queue. Every pull request that adds a package or touches scaffolding would flake the same way. No check is removed or weakened: the same steps run, they only have room to finish.

## Covers

- .github/
