# Self-hosted CI runners (our own server)

Linux jobs of `ci.yml` for `halonic-com/halonic`, run on our own server instead of
GitHub-hosted runners, **only for our own reviewed runs**: pushes to `main` now, merge groups
later. The one exception is the **fast pool** (HAL-15972): open pull requests from our own
branches that carry the `fast-track` label, on their own slots, with the shared caches read-only.
Fork pull requests never run here. Plan and security review: HAL-14831 (Julian's changes C1–C8
and the fork test T1); the fast pool: HAL-15972.

This folder is the server's setup **as built** (21 Nov 2026). A change here is deployed to the
server by the board supervisor after it merges; the server doesn't pull from the repo.

## How a job gets here

1. **Routing** (`.github/workflows/ci.yml`): a job uses `vars.CI_RUNNER_LARGE` or
   `vars.CI_RUNNER_SMALL` only for a merge group or a push to `main`, and only while the event is
   listed in `vars.CI_SELF_HOSTED_EVENTS`. Empty variables send everything to `ubuntu-24.04`.
   This is routing, not security: a fork's pull request runs its own copy of `ci.yml`.
2. **The runner group** `halonic-ci` serves only `halonic-com/halonic`.
3. **The hook** (`vm/job-started.sh`) is the boundary. It is baked into the image, runs before
   the job's first step and fails the job unless every check passes. It trusts nothing a
   workflow can set:
   - its settings come from `pool.conf`, mounted read-only from the VM (it refuses a writable one);
   - the event comes from the file the runner writes at a fixed path, and the event name in the
     environment must match it;
   - the repository must be `halonic-com/halonic` in both the event and the environment, and not a fork;
   - **a `pull_request` is refused unless `pool.conf` says `POOL="fast"`** (only the fast slots'
     `pool-fast/pool.conf` does; the slot script refuses to start any other slot whose config
     says so or lists `pull_request`). On the fast pool the event's pull request must come from
     and go into `halonic-com/halonic`, run `ci.yml@refs/pull/<n>/merge`, and see the three cache
     mounts as overlays or read-only. Then the hook asks the VM's gate about pull request `<n>`
     **now**, not as the event saw it: it must be open, not cross-repository, with a head
     repository owned by `halonic-com`, still at the event's head commit, and labelled
     `fast-track`. A gate or API failure, a missing field or a pull request not found is a refusal;
   - a push must be to `main` and run `ci.yml@refs/heads/main`; a merge group must target `main`
     and run `ci.yml` from its own `gh-readonly-queue/main/pr-<n>-<sha>` ref;
   - **a merge group must hold only our own pull requests (C7):** the hook asks the VM's queue
     gate for `main`'s merge queue, finds the entry whose pull request is `<n>` and whose head
     commit is the group's commit, and refuses the job if that entry or any entry ahead of it
     (their code is in the group's commit too) is cross-repository or has a head repository
     owned outside `halonic-com`. A gate that doesn't answer or answers an error (its GitHub
     call failed or timed out) is asked again after 5 s and 10 s, with each failed try and its
     reason in the job's log; after the third, the job is refused. This holds for the fast
     pool's pull request query too. An answer is never retried: GraphQL errors, no queue, an
     entry not found or more than 100 entries is a refusal at once;
   - the event must be in `ALLOWED_EVENTS` (`"push"` now; `merge_group` only after T1; the fast
     pool's is `"pull_request"`);
   - `set -euo pipefail`: a missing `jq`, event file or pool file is a refusal.
4. **Fork run approval** (repo setting): a maintainer approves every outside contributor's run.

`SMOKE_BRANCH` / `SMOKE_WORKFLOW` in `pool.conf` admit one test workflow on one own branch. Both
are empty except during a smoke test. That branch's code is **not reviewed** and runs with the
writable shared caches, so use only a branch that only admins can push to, and empty both again
right after the test.

`node --test infra/ci-runner/hook.test.mjs` runs the hook as shipped against sample events and a
stand-in queue gate, and the gate against a stub API (`queue-gate.test.mjs`, imported; CI runs
it in the `fast` job).

## Layout

| Where | What |
| --- | --- |
| Host | KVM VM `halonic-ci` (pinned CPUs, fixed memory, its own disks with I/O caps). Network `ci-net` with the nftables table in `host/halonic-ci.nft`: out only TCP 80/443, DNS to 1.1.1.1 / 1.0.0.1, NTP. The host, its public range, Docker bridges, private, CGNAT and link-local ranges, IPv6 and anything inbound are dropped. |
| Host | `host/halonic-ci-status.*`: a read-only status feed, fetched from the VM every minute over SSH with a key that can run only the status command. |
| VM | Docker with `userns-remap`. One systemd unit per slot (`vm/halonic-runner@.service`). |
| VM | `/etc/halonic-ci/app.pem`: the GitHub App's key (only permission: self-hosted runners), root-only `0400`. Never in the image, a container or a backup that leaves the VM. |
| VM | Queue gate (C7): `vm/halonic-ci-gate.socket` listens on `/run/halonic-ci-gate/gate.sock`, which every container gets read-only. Each connection starts `vm/halonic-ci-gate@.service` (`vm/halonic-ci-gate.sh`), which answers one of two fixed GraphQL queries: one pull request's state, owner, head commit and labels for `GET /pr/<n>` (1-9 digits, the only input that reaches a query), `main`'s merge queue for anything else. Its token is `/etc/halonic-ci/queue-token`, root-only `0400`, handed to the service as a systemd credential under a throwaway user. |
| VM | Fast pool (HAL-15972): fast slots' containers run under gVisor (`runsc`) on the Docker network `halonic-ci-fast` (no traffic between its containers, and none to the merge-group jobs on the default bridge), and get the gate as `vm/halonic-ci-gate-fast.socket` (`/run/halonic-ci-gate-fast/gate.sock`, 4 connections, at most 10 a minute, pull request queries only) instead of the merge queue's. |
| VM | `/cache/trusted/{pnpm-store,turbo,ms-playwright}`: package, Turbo and browser caches, no secrets, shared by all slots and kept between jobs, capped together at 20 GB (XFS project 300). `/cache/work/<slot>`: the job's work dir, quota-capped and wiped after every job. |

Site data stays out of this repo: `/etc/halonic-ci/pool.env` (see `vm/pool.env.example`),
`/etc/halonic-ci/slots` (the list of slot units) and `/etc/halonic-ci/site.nft` (the server's
public range for the nftables rules).

**The shared caches are writable from every job that runs here.** Every container mounts
`/cache/trusted/pnpm-store`, `/cache/trusted/turbo` and `/cache/trusted/ms-playwright` read-write, so a job can change
what later jobs read from them. That's acceptable only because the hook admits nothing but reviewed
code (pushes to `main`, later merge groups). pnpm checks each package against the lockfile's
integrity hash; the Turbo cache (the build job's `TURBO_CACHE_DIR`, HAL-15467; only the remote cache's entries are signed) and the Playwright browsers aren't checked.

**The fast pool never gets these folders read-write (C2, C8).** For each cache, a fast slot mounts
an overlay on the VM: the shared folder is its read-only lower layer, and every write goes to an
upper layer under `/cache/overlay/<slot>`, counted in the slot's quota and deleted with the job. A
fast-track job reads what reviewed runs cached; nothing it writes reaches another job. It gets no
Turbo token either (`ci.yml` asks for one only off pull requests, and the cache hands a write token
only to a push to `main`). The job runs under gVisor, which gives it a kernel of its own in user
space, so a kernel bug it finds doesn't reach the VM, the App key or the merge-group jobs (C8).
Inside gVisor every mount shows as its file proxy's (`9p`), so the slot script checks on the VM that
each cache is an overlay before the container starts. The shared folders keep changing under a running overlay (other slots
write to them, the weekly cleanup deletes old Turbo entries); a file that changes mid-job reads as
a cache miss at worst.

## One job, one container

`vm/halonic-runner-slot.sh` runs one cycle of a slot: it mints an App token, asks GitHub for a
just-in-time runner config (one runner, one job), starts `docker run --rm` of the image, waits
for it to exit and cleans up. systemd starts the next cycle.

| Slot | Label | CPUs | Pinned to vCPUs | Memory (= swap): start → most | Work dir |
| --- | --- | --- | --- | --- | --- |
| `large-1` … `large-11` | `halonic-ci-large` | 6 | 0-5, 6-11, … 60-65 (`(N-1)*6`–`N*6-1`) | 10 GB (fixed) | 20 GB |
| `small-1` … `small-3` | `halonic-ci-small` | 2 each | 66-71 (shared) | 2 GB → 3 GB | 6 GB |
| `fast-1` … `fast-3` | `halonic-ci-fast` | 6 | those of `large-11`, `large-10`, `large-9` | 10 GB (fixed) | 20 GB |

The VM has 80 vCPUs (40 cores) and 128 GB. Each slot is pinned to its own vCPUs
(`--cpuset-cpus`), so a job sees only those (`nproc`, Node's `availableParallelism`) and test
runners don't start a worker for each of the VM's 80. The eleven large slots take vCPUs 0-65, the
three small slots share 66-71 (capped at 2 CPUs each), and vCPUs 72-79 are left for the VM itself.

**Large and fast slots get their 10 GB from the start** (HAL-15994). With a 4 GB start, jobs that start
hundreds of processes at once (`changeset version`) outgrew the 3-second step and were killed at
6 GB, and the kernel's reclaim at `memory.high` pushed the VM's load past 200. A fast slot takes
a large slot's place, so it doesn't change the total. Eleven large slots at 10 GB plus three small at 3 GB are 119 GB of the VM's 126 GB usable; don't enable more large
slots without taking memory from somewhere else.

**Small slots' memory grows as a job needs it** (since 22 Nov 2026). A container starts at its start size
(`MEM_START`). Every 3 s the slot script reads the job's anon + shmem (process memory plus the
`/tmp` tmpfs; file cache doesn't count, the kernel drops it under pressure). When that comes within
1.5 GB of the limit, the script raises the limit and swap by 2 GB with `docker update`, up to the
most (`MEM`), as long as the VM keeps 4 GB available; otherwise it logs that it didn't. The
cgroup's `memory.high` sits 512 MB under the limit, so the kernel reclaims cache and slows the job
before the hard limit kills it, which gives the loop time to grow it. Every slot at its most
(110 GB large, 9 GB small) still fits the VM's 128 GB, so growth can't overcommit it.

Every container: all capabilities dropped, `no-new-privileges`, Docker's default seccomp and
AppArmor profiles, `--pids-limit 8192`, no host devices, no Docker socket. The image
(`vm/Dockerfile`) has no `sudo` and no Docker, so `container:` and `services:` jobs fail, and the
e2e job's apt step is skipped on this runner (Playwright's libraries are preinstalled).

## Operating

- **App key:** the slot script refuses to start unless `/etc/halonic-ci/app.pem` is a root-owned
  `0400` file, and unless `/etc/subuid` has the `dockremap` range (userns-remap on).
- **Weekly audit (Timothy):** check the org audit log for any change to the `halonic-ci` runner
  group (repositories, workflows, public repos) and to the `halonic-ci-runners` App (C6).
- **Pause:** while `/etc/halonic-ci/paused` exists, a slot registers no runner: each cycle sees
  the file, waits 30 s and ends. A job already running finishes. Remove the file and the slots
  take jobs again within a minute.
- **Kill switch:** clear `CI_RUNNER_LARGE`, `CI_RUNNER_SMALL` and `CI_RUNNER_FAST` (the next runs
  go back to GitHub-hosted). On the VM: `touch /etc/halonic-ci/paused` and stop the slots. If the VM is
  suspected compromised, also revoke the App key and rotate the Turbo signing key.
- **Queue gate (C7) and its token:** the token is a fine-grained personal access token of
  `halonic-dev`, for `halonic-com/halonic` only, read-only (metadata, contents, pull requests),
  with an expiry. Install it with `install -m 0400 -o root -g root /dev/stdin
  /etc/halonic-ci/queue-token` (paste, then Ctrl-D), never in `pool/` (the folder jobs see), the
  image, the repo or a backup that leaves the VM. Copy `vm/halonic-ci-gate.sh` to
  `/usr/local/sbin/` (root, `0755`), the two units to `/etc/systemd/system/`, then
  `systemctl daemon-reload && systemctl enable --now halonic-ci-gate.socket`. Check it from the VM
  with `curl -s --unix-socket /run/halonic-ci-gate/gate.sock http://gate/ | head -c 300`.
  **To rotate:** make the new token, install it the same way (the next connection reads it; no
  restart), check as above, then delete the old token on GitHub. When the token expires or is
  revoked, every merge group is refused, which fails safe.
- **Merge groups on:** `ALLOWED_EVENTS="push merge_group"` in the VM's
  `/etc/halonic-ci/pool/pool.conf` (applies at once), only after the queue gate is deployed and
  Julian has checked T1 against it.
- **Fast pool on** (only after Julian's OK on HAL-15972). A fast slot refuses to start until
  each of these is in place:
  1. **gVisor:** install `runsc` from gVisor's apt repository and register it in
     `/etc/docker/daemon.json` as `"runtimes": {"runsc": {"path": "/usr/bin/runsc",
     "runtimeArgs": ["--host-uds=open", "--overlay2=root:self"]}}`, then restart Docker.
     `--host-uds=open` lets a job reach the gate socket mounted into it (nothing else is
     mounted); `--overlay2=root:self` keeps the container's own writes on disk instead of in its
     memory limit.
  2. **Network:** `docker network create -o com.docker.network.bridge.enable_icc=false
     halonic-ci-fast`.
  3. **Gate:** deploy the new `vm/halonic-ci-gate.sh` and the two `vm/halonic-ci-gate-fast*`
     units like the merge queue's, then `systemctl enable --now halonic-ci-gate-fast.socket`.
     `PollLimitBurst` needs systemd 255 or later (older ones ignore it).
  4. Put `vm/pool-fast.conf` at `/etc/halonic-ci/pool-fast/pool.conf` (root, `0444`). A fast slot
     takes a large slot's CPUs, so stop and disable `large-11` before you enable `fast-1`
     (`large-10` for `fast-2`, `large-9` for `fast-3`; each refuses to start while its twin
     runs), and update `/etc/halonic-ci/slots`.
  5. **Smoke test** with one fast slot before setting the variable for everyone: a labelled test
     pull request should pass the hook, and the status feed should show its memory and CPU. Not
     tried yet under gVisor: Docker's `userns-remap`, the slot's cgroup path (memory sampling and
     `docker update`) and Chromium (may need `--no-sandbox`). If one doesn't work, stop and say so
     on HAL-15972; fast slots don't run without gVisor.

  Then set
  `CI_RUNNER_FAST` to `{"group":"halonic-ci","labels":["halonic-ci-fast"]}`. Off: clear
  `CI_RUNNER_FAST`, then stop the fast slots and start the large ones again.
- **Runner update:** new version and checksum in `vm/Dockerfile`, build the image in the VM,
  set `IMAGE=` in `pool.env`, restart the slots.
- **Weekly** (`vm/halonic-ci-maint.timer`, Sunday 04:00): prunes images, stale work dirs and Turbo
  entries unused for 7 days. When
  `/cache` is over 75 %, it pauses the slots, lets running jobs finish (up to 2 hours), empties the
  shared caches and starts the slots again.
- **Hourly** (`vm/halonic-ci-cache-check.timer`): the same pause-and-empty as soon as the shared
  caches pass 80 % of their 20 GB quota (or `/cache` passes 75 %), so a full quota never fails
  every install. It shares a lock with the weekly cleanup and skips its hour while that runs.
- **Firewall first:** `host/halonic-ci-nft.service` is required by `libvirtd.service`. If the rules
  don't load (a missing `/etc/halonic-ci/site.nft`, say), libvirtd and the CI VM don't start.
  The unit has no stop command: stopping it leaves the rules in place, because the VM keeps
  running without libvirtd. After editing the rules, `systemctl reload halonic-ci-nft` swaps them
  in one step, and a file that doesn't load keeps the old ones.
- **Status:** the host writes `/srv/ci/status/ci-status.json` and `jobs.jsonl` (per job: event,
  ref, seconds, `mem_peak`, `mem_anon_peak`, `mem_start`, `mem_limit` at the end, `mem_grows`,
  `cpu_seconds`). On GitHub, a job's `runnerName` starting with `hci-`
  ran here. The status files carry fields a job controls (ref, event), so a dashboard or an agent
  reads them as untrusted text, never as commands or markup.

## Not built yet

- A bandwidth cap (`tc`) on the CI network.
- A size cap on each container's writable layer (the runner's home, `~/.cache`). It needs Docker's
  data root on an XFS volume mounted with `pquota`, then `--storage-opt size=` per slot (C5).
- Runner `--disableupdate` and a weekly image rebuild (today the timer only prunes).
- A check that nothing trusts the server's public IP (C4).
- Paperclip's cpuset kept off the CI CPUs.
- The runner group restricted to `ci.yml`.
- The real-fork test (T1).
