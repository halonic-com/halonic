# Self-hosted CI runners (our own server)

Linux jobs of `ci.yml` for `halonic-com/halonic`, run on our own server instead of
GitHub-hosted runners, **only for our own reviewed runs**: pushes to `main` now, merge groups
later. The one exception is the **fast pool** (HAL-15972): open pull requests labelled
`fast-track` that a person opened from our own branches (HAL-17616; from HAL-17463 until then every
person's pull request ran here), on their own slots, with the shared caches read-only. Fork pull
requests and bots' pull requests never run here, labelled or not. Plan and security review:
HAL-14831 (Julian's changes C1–C8 and the fork test T1); the fast pool: HAL-15972, HAL-17463,
HAL-17574, HAL-17616 and HAL-17654 (used only while it has room).

This folder is the server's setup **as built** (21 Nov 2026). A change here is deployed to the
server by the board supervisor after it merges; the server doesn't pull from the repo.

## How a job gets here

1. **Routing** (`.github/workflows/ci.yml`): a job uses `vars.CI_RUNNER_LARGE` or
   `vars.CI_RUNNER_SMALL` only for a merge group or a push to `main`, and only while the event is
   listed in `vars.CI_SELF_HOSTED_EVENTS`. Empty variables send everything to `ubuntu-24.04`.
   A pull request a person opened from our own branch uses `vars.CI_RUNNER_FAST` only when the
   run's first job, `pick-runner` (`pick-runner.mjs`, HAL-17654), answers `fast`: the pull
   request is in `vars.CI_FAST_SCOPE` (`fast-track`, the default: labelled ones only; or `all`)
   and the pool has at least `vars.CI_FAST_MIN_IDLE` (14 when unset) online, idle runners right
   now. Otherwise the whole run stays on `ubuntu-24.04`, and so does every fork's and bot's pull
   request (a `Bot` account, a login ending in `[bot]`, `dependabot`, `renovate`,
   `renovate-bot`), labelled or not. Adding the label restarts the pull request's run
   (`fast-track-label.yml`, HAL-17672 and HAL-17992): every job runs again, and `pick-runner` reads
   the labels as they are now, so the picker routes it like a push's. Any other label starts no
   `ci.yml` run, which would hide `ci-ok` from GitHub's merge check. The hook and the gate need
   nothing for it: they read the pull request as it is when the job starts, whatever event started
   the run. This is routing, not security: a pull request runs its own copy of `ci.yml`.
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
     repository owned by `halonic-com`, still at the event's head commit, labelled `fast-track`
     (HAL-17616; not asked when the fast pool's `pool.conf` says `PR_SCOPE="all"`, HAL-17654),
     and opened by a person: its author a `User` (not a `Bot`) whose login doesn't end
     in `[bot]` and isn't `dependabot`, `renovate` or `renovate-bot` (HAL-17463). A gate or API
     failure, a missing field, label list or author, or a pull request not found is a refusal;
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
it in the `fast` job). `node --test infra/ci-runner/pick-runner.test.mjs` runs the picker against
a stub of GitHub's runners API; it is a file of its own, because `hook-run.mjs` waits at the top
level and the picker's tests would end the run before the hook's start.

## Layout

| Where | What |
| --- | --- |
| Host | KVM VM `halonic-ci` (pinned CPUs, fixed memory, its own disks with I/O caps). Network `ci-net` with the nftables table in `host/halonic-ci.nft`: out only TCP 80/443, DNS to 1.1.1.1 / 1.0.0.1, NTP. The host, its public range, Docker bridges, private, CGNAT and link-local ranges, IPv6 and anything inbound are dropped. |
| Host | `host/halonic-ci-status.*`: a read-only status feed, fetched from the VM every minute over SSH with a key that can run only the status command. |
| VM | Docker with `userns-remap`. One systemd unit per slot (`vm/halonic-runner@.service`). |
| VM | `/etc/halonic-ci/app.pem`: the GitHub App's key (only permission: self-hosted runners), root-only `0400`. Never in the image, a container or a backup that leaves the VM. |
| VM | Queue gate (C7): `vm/halonic-ci-gate.socket` listens on `/run/halonic-ci-gate/gate.sock`, which every container gets read-only. Each connection starts `vm/halonic-ci-gate@.service` (`vm/halonic-ci-gate.sh`), which answers one of two fixed GraphQL queries: one pull request's state, owner, head commit, head branch and author for `GET /pr/<n>` (1-9 digits, the only input that reaches a query), `main`'s merge queue for anything else. Its token is `/etc/halonic-ci/queue-token`, root-only `0400`, handed to the service as a systemd credential under a throwaway user. |
| VM | Fast pool (HAL-15972): fast slots' containers run under gVisor (`runsc`) on the Docker network `halonic-ci-fast` (no traffic between its containers, and none to the merge-group jobs on the default bridge), and each gets a gate socket of its own, `vm/halonic-ci-gate-fast@.socket` (`/run/halonic-ci-gate-fast/<slot>/gate.sock`, 3 connections, at most 3 per 150 s, so 48 a minute over 40 slots, pull request queries only; HAL-17473) instead of the merge queue's. |
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
an overlay on the VM: a snapshot of the shared folder is its read-only lower layer, and every write
goes to an upper layer under `/cache/overlay/<slot>`, counted in the slot's quota and deleted with
the job. A pull request's job reads what reviewed runs cached; nothing it writes reaches another job. It gets no
Turbo token either (`ci.yml` asks for one only off pull requests, and the cache hands a write token
only to a push to `main`). The job runs under gVisor, which gives it a kernel of its own in user
space, so a kernel bug it finds doesn't reach the VM, the App key or the merge-group jobs (C8).
Inside gVisor every mount shows as its file proxy's (`9p`), so the slot script checks on the VM that
each cache is an overlay before the container starts.

**The snapshot (HAL-16032).** The overlay can't use `/cache/trusted` itself: merge-group jobs keep
writing there, and a lower layer that changes while it's mounted is undefined behaviour, so a fast
job could read a half-written entry. `vm/halonic-ci-fast-lower.sh refresh` copies the three folders
into a new generation `/cache/fast-lower/<n>` with `cp --reflink=always` (XFS shares the blocks
instead of copying them, so a generation costs disk only for what the shared folders delete later),
leaves out every file whose inode changed from 2 minutes before the copy on (it may have been
copied half-written; a missing entry is only a cache miss), and points `/cache/fast-lower/current` at it. A slot mounts the current generation; nothing changes a
generation once it's published, and refresh deletes the old ones no overlay mounts any more. The
copy and the clean-up run as the runner's uid (`setpriv`), never as root, so a link a job swaps in
mid-copy reaches only what jobs could read anyway. `vm/halonic-ci-fast-lower.timer` refreshes it every
5 minutes once fast slots are listed in `/etc/halonic-ci/slots` (HAL-18424: hourly, a fast pull
request missed nearly every typecheck and test entry, whose hashes change with most pushes to main).
It skips a round while the weekly cleanup or the hourly check holds their lock and logs why
(`journalctl -t halonic-ci-fast-lower`); the unit fails when the current generation is over 30 minutes
old. A slot mounts the
generation current when it starts and may then wait long for a job, so an idle fast slot whose
generation is over 10 minutes old, with a newer one published, deletes its runner and restarts on the
new one. GitHub refuses to delete a runner that has taken a job, so a slot with a job is never
restarted. An idle slot whose generation passes 30 minutes logs a warning every minute. A slot that
finds no generation makes the first one. A failed copy keeps the last generation and is
logged (`journalctl -t halonic-ci-maint`).

## One job, one container

`vm/halonic-runner-slot.sh` runs one cycle of a slot: it mints an App token, asks GitHub for a
just-in-time runner config (one runner, one job), starts `docker run --rm` of the image, waits
for it to exit and cleans up. systemd starts the next cycle.

| Slot | Label | CPUs | Pinned to vCPUs | Memory (= swap): start → most | Work dir |
| --- | --- | --- | --- | --- | --- |
| `large-1` … `large-11` | `halonic-ci-large` | 6 | 0-5, 6-11, … 60-65 (`(N-1)*6`–`N*6-1`) | 6 GB → 16 GB | 20 GB |
| `large-12` … `large-14` | `halonic-ci-large` | 6 | 3-8, 27-32, 51-56 (shared with two other large slots each) | 6 GB → 16 GB | 20 GB |
| `large-15` … `large-19` | `halonic-ci-large` | 6 | 72-77, 78-83, … 96-101 | 6 GB → 16 GB | 20 GB |
| `small-1` … `small-3` | `halonic-ci-small` | 2 each | 66-71 (shared) | 2 GB → 3 GB | 6 GB |
| `fast-1` … `fast-3` | `halonic-ci-fast` | 6 | those of `large-11`, `large-10`, `large-9` | 4 GB → 16 GB | 20 GB |
| `fast-4` … `fast-8` | `halonic-ci-fast` | 6 | those of `large-15` … `large-19` (shared) | 4 GB → 16 GB | 20 GB |
| `fast-9`, `fast-10` | `halonic-ci-fast` | 6 | 15-20, 39-44 (shared with two large slots each) | 4 GB → 16 GB | 20 GB |
| `fast-11` … `fast-16` (normal pool); `fast-17` … `fast-40` stopped | `halonic-ci-fast` | 4 (quota) | float over 0-65 and 72-101 while `runsc` runs with `--cpu-num-from-quota`; without it a fixed 4-vCPU set each (`FAST4_FROM`; `fast-11` … `fast-24` keep 0-3, 4-7, 8-11, 22-25, 26-29, 30-33, 34-37, 50-53, 56-59, 62-65, 74-77, 80-83, 86-89, 92-95) | 4 GB → 12 GB | 20 GB |

The VM has 112 vCPUs (56 cores) and 128 GB. Each slot is pinned to its own vCPUs
(`--cpuset-cpus`), so a job sees only those (`nproc`, Node's `availableParallelism`) and test
runners don't start a worker for each of the VM's 112. The eleven large slots take vCPUs 0-65, the
three small slots share 66-71 (capped at 2 CPUs each), large-15..19 take 72-101, and 102-111 are left
for the VM itself.

**The normal fast pool is fast-1 … fast-16** (HAL-17616). With every person's pull request on 40
fast slots (HAL-17463, HAL-17574) the VM's CPUs were full on 24 Nov (80 % busy, CPU pressure 63 %,
run queue 316) and a 1-minute typecheck took 4-8 minutes; with only `fast-track` pull requests 16
slots are enough. The units for fast-17 … fast-40 stay installed but stopped (Operating, below).

**fast-11 … fast-40 float** (HAL-17574). With 40 fast slots the pinned sets would ask for 276 vCPUs
on the 96 outside the small slots' and the VM's, so a fixed map puts three or four slots on most
cores while other cores sit idle (on 24 Nov the guest was 70 % idle with CPU pressure around 24 %).
So the 4-CPU fast slots get all of 0-65 and 72-101 as their set and `--cpus 4` as their quota, and
the kernel runs them wherever cores are free. The job still sees 4 CPUs only because `runsc` runs with
`--cpu-num-from-quota` (in `daemon.json`'s `runtimeArgs`): the slot script reads that from
`docker info` and, without it, pins each of them to a fixed 4-vCPU set instead, as before. Large
slots get twice the CPU weight (`--cpu-shares 2048`), so where a merge-group job and fast jobs want
the same core, the merge group gets two thirds of it.

**Memory grows as a job needs it** (since 22 Nov 2026; HAL-15994 asked for a fixed 10 GB start after
kills at 6 GB under the old 4 GB start, 2 GB step and 3 s check. With the 6 GB start, 4 GB step every
2 s and #4976 cutting Fast gates to under 1 GB, nothing was killed since 08:07 UTC, and a fixed 10 GB
on 19 large slots would allow 190 GB on the 128 GB VM). A container starts at its start size
(`MEM_START`). Every 2 s the slot script reads the job's anon + shmem (process memory plus the
`/tmp` tmpfs; file cache doesn't count, the kernel drops it under pressure). When that comes within
2 GB of the limit, the script raises the limit and swap by 4 GB with `docker update`, up to the
most (`MEM`), as long as the VM keeps 4 GB available; otherwise it logs that it didn't. The
cgroup's `memory.high` sits 512 MB under the limit, so the kernel reclaims cache and slows the job
before the hard limit kills it, which gives the loop time to grow it. All slots start at
19×6 + 3×2 = 120 GB and could grow to 19×16 + 3×3 = 313 GB, far more than the VM's 128 GB. The
VM-wide reserve check (`MemAvailable` above the 4 GB step plus 4 GB) is the only thing that stops
growth from overcommitting it. The 40 fast slots add 40×4 = 160 GB of start size (fast-1..10 start at 4 GB too since HAL-17574): fast jobs
peaked at 4.4 GB (p90 4.35 GB) over 24 h on 23–24 Nov, so most stay at their start size, and the same
reserve check stops the rest from growing past what the VM has. Start sizes aren't covered by that
check, so a fast slot also waits before it registers a runner (memory admission, HAL-17463): it
registers only while the VM's available memory, less the start size of every idle fast runner and
what every busy job may still take without asking, is at least its start size plus the 4 GB reserve;
otherwise it logs `waiting for memory` and checks again every 15 s. A slot's state not updated for
120 s (a running slot rewrites it every 2 s), or with no `updated_at`, counts as gone and promises
nothing, and a stopped slot's `--cleanup` removes its state first (HAL-17558). A busy job counts for
at most 2 GB beyond what it uses now (anon + shmem), not all the way to its limit (HAL-17574): its
limit grows 4 GB at a time, so a job that peaks at 3-4 GB used to hold 4-5 GB back, and 24 fast
slots on 96 GB topped out at 16-18 jobs; with the board's 24 Nov snapshot (68 GB available, 12 busy,
4 idle) 22 fast runners now fit instead of 16, and about 7 more on 128 GB. That is an overcommit on
purpose: fast jobs rarely all grow at once. If they do and the VM runs out, fast containers have
`--oom-score-adj 500`, so the kernel kills a fast job (its PR re-runs) before a merge-group job.
Large and small slots never wait. **When the VM is short**, then: no new fast job starts (fast jobs wait in GitHub's queue), a
running job's limit isn't raised, and a job that needs more than its limit is slowed at `memory.high`
and, past the limit, killed inside its own container (its job fails); the VM itself isn't
overcommitted by idle fast runners.

Every container: all capabilities dropped, `no-new-privileges`, Docker's default seccomp and
AppArmor profiles, `--pids-limit 8192`, no host devices, no Docker socket. The image
(`vm/Dockerfile`) has no `sudo` and no Docker, so `container:` and `services:` jobs fail, and the
e2e job's apt step is skipped on this runner (Playwright's libraries are preinstalled).

## Operating

- **App key:** the slot script refuses to start unless `/etc/halonic-ci/app.pem` is a root-owned
  `0400` file, and unless `/etc/subuid` has the `dockremap` range (userns-remap on).
- **Weekly audit (the board):** check the org audit log for any change to the `halonic-ci` runner
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
  2. **Network:** `docker network create --subnet 192.168.241.0/24 -o
     com.docker.network.bridge.enable_icc=false halonic-ci-fast`. Pin the subnet: from Docker's
     default pools it gets a /28, 13 addresses, and every fast container needs one (HAL-17574). A
     fast slot refuses to start on a network smaller than a /26.
  3. **Gate:** deploy the new `vm/halonic-ci-gate.sh` and the two `vm/halonic-ci-gate-fast*`
     units like the merge queue's, then `systemctl enable --now halonic-ci-gate-fast@fast-1.socket`
     (one per fast slot; a fast slot refuses to start without its own).
     `PollLimitBurst` needs systemd 255 or later (older ones ignore it).
  4. **Snapshot:** install `vm/halonic-ci-fast-lower.sh` to `/usr/local/sbin/` (root, `0755`)
     with the new `vm/halonic-ci-maint.sh`, and `vm/halonic-ci-fast-lower.{service,timer}` like the
     other units (`systemctl enable --now halonic-ci-fast-lower.timer`). `/cache` must be XFS with reflinks
     (`xfs_info /cache | grep -o 'reflink=1'`); without them the copy fails and so does the slot.
     Run `/usr/local/sbin/halonic-ci-fast-lower.sh refresh` once and check that it prints a
     generation.
  5. Put `vm/pool-fast.conf` at `/etc/halonic-ci/pool-fast/pool.conf` (root, `0444`). A fast slot
     takes a large slot's CPUs, so stop and disable `large-11` before you enable `fast-1`
     (`large-10` for `fast-2`, `large-9` for `fast-3`; each refuses to start while its twin
     runs), and update `/etc/halonic-ci/slots`.
  6. **Smoke test** with one fast slot before setting the variable for everyone: a labelled test
     pull request should pass the hook, and the status feed should show its memory and CPU. Not
     tried yet under gVisor: Docker's `userns-remap`, the slot's cgroup path (memory sampling and
     `docker update`) and Chromium (may need `--no-sandbox`). If one doesn't work, stop and say so
     on HAL-15972; fast slots don't run without gVisor.

  Then set
  `CI_RUNNER_FAST` to `{"group":"halonic-ci","labels":["halonic-ci-fast"]}`. Off: clear
  `CI_RUNNER_FAST`, then stop the fast slots and start the large ones again.
- **Every person's pull request** (HAL-17463, only after Julian's OK on that task). Keep copies of
  the live `/etc/halonic-ci/pool-fast/pool.conf`, slot script, gate script and units, and the
  current image (it holds the hook), first. Raise the VM's memory target (about 96 GB), then deploy the new
  `vm/halonic-ci-gate.sh` and `vm/halonic-ci-gate-fast.socket` (`systemctl daemon-reload &&
  systemctl restart halonic-ci-gate-fast.socket`), rebuild the image with the new hook, deploy
  `vm/halonic-runner-slot.sh` and `vm/pool-fast.conf`, and add `halonic-runner@fast-11` …
  `halonic-runner@fast-24` to `/etc/halonic-ci/slots` and start them. On a 72 GB VM not all of
  them register at once: memory admission (above) holds the rest, which is expected. The new hook needs the new
  gate (it reads the pull request's author), so deploy the gate first. Then a pull request without
  a label should show its Linux checks on `hci-fast-*`. Off at once: clear `CI_RUNNER_FAST`. Back:
  restore the copies and restart the gate socket and the slots.
- **40 fast slots** (HAL-17574, after Liam's and Julian's OK). Keep copies of the live slot script
  and `halonic-ci-gate-fast.socket` first. Add `"--cpu-num-from-quota"` to `runsc`'s
  `runtimeArgs` in `/etc/docker/daemon.json` and `systemctl reload docker` (Docker rereads its
  runtimes on a reload; running containers keep theirs). Deploy `vm/halonic-ci-gate-fast.socket`
  (`systemctl daemon-reload && systemctl restart halonic-ci-gate-fast.socket`) and
  `vm/halonic-runner-slot.sh`, restart `fast-11` and `large-1` while idle, and check
  `docker inspect -f '{{.HostConfig.CpusetCpus}} {{.HostConfig.CpuShares}} {{.HostConfig.OomScoreAdj}}'`
  on their containers (`0-65,72-101 1024 500` and `0-5 2048 0`) and `nproc` in a fast job (4). Then add
  `halonic-runner@fast-25` … `halonic-runner@fast-40` to `/etc/halonic-ci/slots` and start them;
  memory admission holds those the VM has no room for. Back to fixed CPU sets: remove the flag and
  reload Docker (slots pick it up on their next cycle). Back to 24 slots: stop and disable
  `fast-25` … `fast-40` and remove them from `/etc/halonic-ci/slots`. The `halonic-ci-fast` network
  must be a /26 or wider (the network step above); the board recreated it as a /24 on 24 Nov. Full: restore the copies.
- **Fast-track pull requests only, 16 fast slots** (HAL-17616, after Liam's and Julian's OK). Keep
  copies of the live gate script and the current image (it holds the hook) first. The new hook
  asks the gate for the labels, so deploy the gate first: the new `vm/halonic-ci-gate.sh` (no
  restart; the next connection runs it). It answers the old hook too, which ignores the labels.
  Then rebuild the image with the new hook and restart the fast slots while idle (or let them
  pick it up on their next cycle); from then on they admit only labelled pull requests, a subset
  of what they admitted before. After the pull request merges, stop and disable `fast-17` …
  `fast-40` and remove them from `/etc/halonic-ci/slots`; keep their units installed. Keep
  everything else as it is: memory admission, the floating CPU sets, `--cpu-shares`, the OOM
  priority and the /24 `halonic-ci-fast` network. Then set `CI_RUNNER_FAST` again, and a
  `fast-track` pull request's next push should show its Linux checks on `hci-fast-*`; one
  without the label stays on GitHub's runners (and if its own `ci.yml` sends it here anyway, the
  hook refuses it with "has no fast-track label"). Off at once: clear `CI_RUNNER_FAST`. Back to
  every person's pull request: restore the gate script and the image, start `fast-17` … `fast-40`
  again, and merge a revert of the `ci.yml` change.
- **One gate socket per fast slot, bot branches refused** (HAL-17473, only after Julian's OK on
  that task). Keep copies of the live slot script, gate script and units, and the current image,
  first. Deploy the new `vm/halonic-ci-gate.sh` (it also asks for the head branch) and
  `vm/halonic-ci-gate-fast@.socket`, then `systemctl daemon-reload`, `systemctl disable --now
  halonic-ci-gate-fast.socket`, delete its old unit file, and `systemctl enable --now
  halonic-ci-gate-fast@fast-N.socket` for every fast slot in `/etc/halonic-ci/slots`
  (`ls /run/halonic-ci-gate-fast/` should list each slot). Then deploy `vm/halonic-runner-slot.sh`,
  rebuild the image with the new hook, and restart the fast slots. The gate first: the new hook
  refuses every pull request while the gate doesn't send the head branch. Back: restore the copies,
  disable the per-slot sockets and enable the old one.
- **Pick by room** (HAL-17654, after Liam's and Julian's OK). `pick-runner` asks GitHub how many
  of the fast pool's runners are online and idle before a pull request's run creates its Linux
  jobs, and sends the whole run to the fast pool only when at least `CI_FAST_MIN_IDLE` are. An
  idle registered runner is real room: a fast slot registers only when memory admission lets it.
  1. **Its token, before the merge.** Without it every pull request, `fast-track` ones too, runs
     on GitHub's runners (the picker never guesses). The board creates a GitHub App owned by
     `halonic-com`, `halonic-ci-pick`, with one permission, **Organization → Self-hosted runners:
     Read-only**, no repository permissions, no webhook, installed on the organisation only. Not
     the runners' `halonic-ci-runners` App: its key can register runners, and a repository
     secret is readable by any workflow on our own branches. Set the repo variable
     `CI_PICK_APP_CLIENT_ID` to its client ID and the repo secret `CI_PICK_APP_KEY` to a private
     key (Actions secrets, not Dependabot's: fork and bot pull requests never get it). The job
     mints a one-hour token with only that read permission and GitHub revokes it when the job ends.
     **Never give this App a second permission or repository access** (Julian, HAL-17693): any
     workflow on our own branches can read its key, so every permission added later goes to
     every writer.
  2. **Merge.** Nothing on the VM changes while `CI_FAST_SCOPE` stays `fast-track`. A
     `fast-track` pull request's run shows "Runners for this run" in `pick-runner`'s summary,
     and its Linux checks on `hci-fast-*` when the pool is free, on GitHub's runners when it isn't.
  3. **Tuning:** `CI_FAST_MIN_IDLE` (a whole number from 1 to 100; anything else sends every run
     to GitHub's runners). A run has about 11 Linux jobs; 14 leaves a margin. Lower it to use the
     pool more, raise it to keep runs off a crowded VM. It applies to the next run.
  4. **Two runs at once:** runs that start within the same few seconds can each see the same
     idle runners. The margin covers one; in the worst case some of their jobs wait in GitHub's
     queue for a fast slot to free up (a minute or two per job). Nothing fails, and a run never
     moves between pools. A re-run of failed jobs reuses its run's answer, so it can wait too.
  5. **Every person's pull request** (only after the board's yes): rebuild the image with this
     hook (the one before it ignores `PR_SCOPE`), then set `PR_SCOPE="all"` in the VM's
     `/etc/halonic-ci/pool-fast/pool.conf` (the hook reads it at each job's start; quotes are
     dropped, so `PR_SCOPE=all` counts too), then set the repo variable `CI_FAST_SCOPE` to `all`. Back: `CI_FAST_SCOPE` to
     `fast-track` first, then `PR_SCOPE="fast-track"`. The VM's setting is the control: with the
     variable on `all` and the VM on `fast-track`, an unlabelled pull request the picker sends
     here is refused by the hook ("has no fast-track label"), never run.
  6. **Off:** clear `CI_PICK_APP_CLIENT_ID` (every pull request runs on GitHub's runners) or
     `CI_RUNNER_FAST` (the picker also skips). Back to the label alone, whatever the pool's load:
     merge a revert of the `ci.yml` change.
- **Runner update:** new version and checksum in `vm/Dockerfile`, build the image in the VM,
  set `IMAGE=` in `pool.env`, restart the slots.
- **Weekly** (`vm/halonic-ci-maint.timer`, Sunday 04:00): prunes images, stale work dirs and Turbo
  entries unused for 7 days. When
  `/cache` is over 75 %, it pauses the slots, lets running jobs finish (up to 2 hours), empties the
  shared caches and starts the slots again.
- **Hourly** (`vm/halonic-ci-cache-check.timer`): the same pause-and-empty as soon as the shared
  caches pass 80 % of their 20 GB quota (or `/cache` passes 75 %), so a full quota never fails
  every install. It shares a lock with the weekly cleanup and skips its hour while that runs.
- **Every 5 minutes** (`vm/halonic-ci-fast-lower.timer`): refreshes the fast slots' snapshot
  (HAL-16032, HAL-18424) once fast slots are deployed, skipping a round while either job above runs.
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
