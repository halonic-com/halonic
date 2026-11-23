# Decision: each CI job's memory starts small and grows as it needs, as live on the server

- Task: HAL-15930 (the board supervisor's comment of 22 Nov 07:10 UTC on HAL-14831: dynamic memory per CI job is live since 07:04 UTC)
- Approval: the board asked for the repo to match the live slot script (HAL-15930: "Act now", 22 Nov); Liam signs this note in review
- Kind: internal
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:H6omAGM3N40FNBT6zZis6gg6hfM6CF3P9XwPVh3r3j/CR3JkMNQIsNYGxrw+Im88cYwr0aabnd/k8xIygLP4CA==

## What changes

- `infra/ci-runner/vm/halonic-runner-slot.sh` is the server's live file, from the board's handover
  copy of 22 Nov 07:10 UTC. It differs from it only in two comments: the sampling loop now changes
  the job's memory limit (the live comment still says it touches nothing), and it samples every
  3 s, not 5 s.
- A container starts at `MEM_START` (large 4 GB, small 2 GB) instead of the most it may use
  (`MEM`, still 10 GB and 3 GB). Every 3 s, when the job's anon + shmem comes within 1.5 GB of the
  limit, the script raises the limit and swap by 2 GB with `docker update`, up to `MEM`, while the
  VM keeps 4 GB available. `memory.high` sits 512 MB under the limit.
- `jobs.jsonl` gets `mem_anon_peak`, `mem_start` and `mem_grows`; `mem_limit` and the status
  feed's `mem_limit` are now the limit at that moment.
- `infra/ci-runner/hook.test.mjs`: the C5 check now looks for `--memory-swap "$MEM_START"` instead
  of `"$MEM"` (the flag moved, it isn't dropped), and a new test checks the start sizes, the cap at
  `MEM`, swap kept equal to the limit, the VM reserve and the new `jobs.jsonl` fields.
- The README's slot table and text describe the start and most sizes and how a job grows.

## Why

Memory peaks of up to 10 GB counted file cache. A job's real memory (anon + shmem) has a median of
0.8 GB and a p95 of 4.2 GB, so a fixed 10 GB per large slot reserves memory most jobs never use.
In the first 40 jobs on the server, 8 grew (one to 10 GB), none failed and none was killed for
running out of memory. Every slot at its most still fits the VM's 128 GB, so growth can't overcommit
it. The board changed the server first; this brings the repo in line, so the next change starts
from the file that runs.

## Tests

No test was weakened or skipped: one assertion follows the flag to its new variable, and a new test
was added. `node --test infra/ci-runner/hook.test.mjs`: 30 tests pass; on `main`'s slot script the
changed and the new test both fail.

## Covers

- infra/ci-runner/hook.test.mjs
