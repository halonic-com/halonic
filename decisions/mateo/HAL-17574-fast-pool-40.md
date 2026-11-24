# Decision: the fast pool grows to 40 slots, and its 4-CPU slots float over the CI VM's cores instead of a fixed set each

- Task: HAL-17574 (the board's decision on the task, 24 Nov)
- Approval: the board decided on HAL-17574 (24 Nov) on fast-25..40 with 4 CPUs each and a CPU placement that spreads the fast slots; Liam signs this note in review, Julian checks C1–C8 on the task
- Kind: internal

## What changes

This extends what HAL-17463 decided (`decisions/mateo/HAL-17463-fast-pool-all-prs.md`); that note
stays as it is.

- `vm/halonic-runner-slot.sh`: new slots `fast-25` … `fast-40`, the same size as `fast-11` …
  `fast-24` (4 CPUs, 4 GB growing to 12 GB, the same memory admission, no twin rule).
- CPU placement: `fast-11` … `fast-40` get all of vCPUs 0-65 and 72-101 as their CPU set and
  `--cpus 4` as their quota, when `runsc` runs with `--cpu-num-from-quota` (read from
  `docker info`), so the job sees 4 CPUs. Without that flag they keep a fixed 4-vCPU set each,
  `fast-11` … `fast-24` the ones they have today. `fast-1` … `fast-10`, the large and the small
  slots keep their sets. Large slots get `--cpu-shares 2048`, every other slot 1024.
- `vm/halonic-ci-gate-fast.socket`: 40 connections (one per fast slot), still at most 48 a minute.
- Tests and the runner README follow.

## Why

On 24 Nov the number of fast slots was the brake: PR jobs waited for a fast runner while the guest
was 70 % idle. A fixed map can't keep each core at two slots: with 40 fast slots the pinned sets ask
for 276 vCPUs on 96, so most cores would carry three and some four while others sit idle, which is
what the CPU pressure already showed with 24. A floating set lets the kernel use the idle cores;
the quota keeps each fast job at GitHub's runner size, and `--cpu-num-from-quota` keeps `nproc` at 4,
so test runners don't start a worker per VM CPU (the reason slots were pinned). Without the flag the
script falls back to fixed sets, so a missing flag never gives a job 96 CPUs. The double CPU weight
keeps merge groups, the path every merge takes, ahead where they share cores with fast jobs.

The gate's rate stays at 48 a minute (2880 an hour against the read-only token's 5000): gate calls
follow the pull request jobs, about 540 an hour, not the number of slots, and 48 still lets all 40
slots start a job in the same minute.

A CPU admission check for fast slots (the cpu-proposal on HAL-17463) is left for later: the slot
count and the placement come first, and the CPU weight already protects the merge groups.

## Tests

No test was skipped or weakened. The gate socket test now expects 40 connections; the sizes and
no-twin tests cover `fast-25` and `fast-40`; a new test checks the floating set for `fast-11` …
`fast-40`, the fixed fallback sets, that only the 4-CPU slots float, the `runsc` flag check and the
CPU weights. `node --test infra/ci-runner/*.test.mjs`: 104 pass.

## Covers

- infra/ci-runner/fast-pool.test.mjs
- infra/ci-runner/hook.test.mjs
