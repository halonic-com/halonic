# Decision: the fast pool grows to 40 slots, and its 4-CPU slots float over the CI VM's cores instead of a fixed set each, and memory admission counts busy jobs less strictly

- Task: HAL-17574 (the board's decision on the task, 24 Nov)
- Approval: the board decided on HAL-17574 (24 Nov) on fast-25..40 with 4 CPUs each and a CPU placement that spreads the fast slots; Liam signs this note in review, Julian checks C1–C8 on the task
- Kind: internal
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:jJtsRR6B4cCbev0Knq8vb//yyutEAeovB6hAiexoGsWx3IniFyCjNQHs+CwrKupjphXQht9hp1iMTt8g8PFvDA==

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
- Memory admission (the board on the task, 24 Nov 15:00 Spain: it, not the slot count, capped the
  pool at 96 GB): a busy job counts for at most 2 GB beyond what it uses now (anon + shmem, a new
  `mem_anon` field in the slot's state; `memory.peak` from an older state), not all the way to its
  limit. `fast-1` … `fast-10` start at 4 GB instead of 6 GB, so an idle runner promises 4 GB like
  the others. Fast containers get `--oom-score-adj 500`, so if the VM runs out anyway the kernel
  kills a fast job before a merge-group job.
- The fast slots' Docker network: a fast slot refuses to start unless `halonic-ci-fast` has an IPv4
  subnet of /26 or wider, and the README's setup step pins it to a /24. Created from Docker's
  default pools it was a /28 with 13 addresses, which held the pool at 13 containers on 24 Nov
  (found live by the board). Isolation stays the same (`enable_icc=false`).
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

Memory admission was counting each busy job up to its limit, which grows 4 GB at a time: on 24 Nov
12 busy fast jobs used about 3.3 GB each but held 32 GB back, so at 96 GB the pool stopped at
16-18 jobs and fast-25..40 would have waited. Capping a job at one growth step (4 GB) would not have
changed that (their headroom was 2.7 GB on average); 2 GB is the margin the growth loop keeps under
the limit anyway. With the board's snapshot 22 fast runners fit instead of 16. This counts less
than the worst case on purpose, since fast jobs rarely all grow at once; the 4 GB reserve stays, and
the OOM priority decides who goes if they do.

A CPU admission check for fast slots (the cpu-proposal on HAL-17463) is left for later: the slot
count and the placement come first, and the CPU weight already protects the merge groups.

## Tests

No test was skipped or weakened. The gate socket test now expects 40 connections; the sizes and
no-twin tests cover `fast-25` and `fast-40`; two admission tests expect a busy job's smaller count (2 GB, not 7), two new ones check the new count and the board's 96 GB snapshot; the gVisor and network test checks the subnet size; a new test checks the floating set for `fast-11` …
`fast-40`, the fixed fallback sets, that only the 4-CPU slots float, the `runsc` flag check and the
CPU weights. `node --test infra/ci-runner/*.test.mjs`: 108 pass.

## Covers

- infra/ci-runner/fast-pool.test.mjs
- infra/ci-runner/hook.test.mjs
- infra/ci-runner/fast-admit.test.mjs
