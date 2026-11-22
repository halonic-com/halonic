# Decision: our CI server gets a fast pool for fast-track pull requests from our own branches, with read-only caches

- Task: HAL-15972 (the board's decision on the task: "Yes go ahead", Timothy, 22 Nov; the team rule is on HAL-15971)
- Approval: the board approved fast-track pull request checks on our CI server (HAL-15972, Timothy, 22 Nov); Liam signs this note in review, Julian checks C1–C8 on the task
- Kind: internal

## What changes

- `infra/ci-runner/vm/job-started.sh` (the hook): a `pull_request` is refused unless the pool
  config says `POOL="fast"`. On the fast pool the event's pull request must come from and go into
  `halonic-com/halonic`, have a plain number and a 40-character head commit, run
  `ci.yml@refs/pull/<n>/merge`, and see `/cache/pnpm-store`, `/cache/turbo` and
  `/cache/ms-playwright` as overlays or read-only mounts. Then it asks the VM's gate for pull
  request `<n>` as it is at job start: open, not cross-repository, head repository owned by
  `halonic-com`, still at the event's head commit, labelled `fast-track`. A gate or API failure,
  an unreadable answer, a missing field or a pull request not found is a refusal. Every other
  pull request stays refused on every pool, as before.
- `vm/halonic-ci-gate.sh`: `GET /pr/<n>` (1-9 digits, checked by a strict pattern) answers a
  second fixed query, that pull request's state, owner, head commit and labels. Anything else
  still gets `main`'s merge queue. The number is the only input that reaches a query.
- `vm/halonic-runner-slot.sh`: new slots `fast-1` … `fast-3`, label `halonic-ci-fast`, sized like a
  large slot and on the CPUs of `large-11` … `large-9`. They mount `/etc/halonic-ci/pool-fast`
  and refuse to start unless its config says `POOL="fast"`; every other slot refuses to start with
  a config that says so or lists `pull_request`. A fast slot mounts each shared cache as an overlay
  whose read-only lower layer is the shared folder and whose upper layer is the job's own, in the
  slot's quota and deleted after the job, never `/cache/trusted` read-write.
- `vm/pool-fast.conf` (new): the fast pool's config, pull requests only. `vm/pool.conf` says
  pull requests never go there.
- Tests: `fast-pool.test.mjs` (new, imported by `hook.test.mjs` so CI's `fast` job runs it), and
  the harness `hook-run.mjs` gets a stand-in mount table and logs what the hook asks the gate.
  In `hook.test.mjs`, three existing tests change with the code:
  - "the shipped hook has the three fixed paths" now checks four (the mount table is the fourth);
  - "refuses every pull request" is now "refuses every pull request outside the fast pool". Its
    assertions are unchanged and still pass: both pull requests are refused on that pool;
  - the C5 slot test looks for the pool mount as `-v "$POOL_DIR:/etc/halonic-ci:ro"`, and checks
    that every slot other than a fast one gets `/etc/halonic-ci/pool`.
- `README.md`: what the fast pool admits, the overlays, the slot table and how to switch it on.

## Why

The board decided that fast-track pull requests from our own branches may run their Linux checks
on our server instead of waiting for GitHub's runners. Anyone who can push a branch to
`halonic-com/halonic` already has write access, so the risk is our own unreviewed code, not a
stranger's. Two things keep that code from reaching later jobs: it never sees the shared caches
read-write (C2, C8), and it gets no Turbo write token. The hook, not the routing, is the boundary:
a pull request's `ci.yml` is its own copy and could name the fast label without the label on the
pull request, so the hook checks the pull request live through the gate, which holds the
read-only token.

Nothing changes on the server when this merges. The board's CI session adds the pool after
Julian's OK; until `CI_RUNNER_FAST` is set (separate `ci.yml` pull request), no job is routed there.

## Tests

No test was weakened or skipped. Three assertions follow the code (above); 11 tests are new.
`node --test infra/ci-runner/hook.test.mjs`: 41 pass. Breaking the hook's pool, cache, label or
open-state check each makes a new test fail.

## Covers

- infra/ci-runner/hook.test.mjs
