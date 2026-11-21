# Self-hosted CI runners (our own server)

Linux jobs of `ci.yml` for `halonic-com/halonic`, run on our own server instead of
GitHub-hosted runners, **only for our own reviewed runs**: pushes to `main` now, merge groups
later. Pull requests never run here, from forks or from our own branches. Plan and security
review: HAL-14831 (Julian's changes C1–C8 and the fork test T1).

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
   - **every `pull_request` is refused**, whatever `pool.conf` says;
   - a push must be to `main` and run `ci.yml@refs/heads/main`; a merge group must target `main`
     and run `ci.yml` from `gh-readonly-queue/main/*`;
   - the event must be in `ALLOWED_EVENTS` (`"push"` now; `merge_group` only after T1);
   - `set -euo pipefail`: a missing `jq`, event file or pool file is a refusal.
4. **Fork run approval** (repo setting): a maintainer approves every outside contributor's run.

`SMOKE_BRANCH` / `SMOKE_WORKFLOW` in `pool.conf` admit one test workflow on one own branch. Both
are empty except during a smoke test. That branch's code is **not reviewed** and runs with the
writable shared caches, so use only a branch that only admins can push to, and empty both again
right after the test.

`node --test infra/ci-runner/hook.test.mjs` runs the hook as shipped against sample events (CI runs
it in the `fast` job).

## Layout

| Where | What |
| --- | --- |
| Host | KVM VM `halonic-ci` (pinned CPUs, fixed memory, its own disks with I/O caps). Network `ci-net` with the nftables table in `host/halonic-ci.nft`: out only TCP 80/443, DNS to 1.1.1.1 / 1.0.0.1, NTP. The host, its public range, Docker bridges, private, CGNAT and link-local ranges, IPv6 and anything inbound are dropped. |
| Host | `host/halonic-ci-status.*`: a read-only status feed, fetched from the VM every minute over SSH with a key that can run only the status command. |
| VM | Docker with `userns-remap`. One systemd unit per slot (`vm/halonic-runner@.service`). |
| VM | `/etc/halonic-ci/app.pem`: the GitHub App's key (only permission: self-hosted runners), root-only `0400`. Never in the image, a container or a backup that leaves the VM. |
| VM | `/cache/trusted/{pnpm-store,ms-playwright}`: package and browser caches, no secrets, shared by all slots and kept between jobs, capped together at 20 GB (XFS project 300). `/cache/work/<slot>`: the job's work dir, quota-capped and wiped after every job. |

Site data stays out of this repo: `/etc/halonic-ci/pool.env` (see `vm/pool.env.example`),
`/etc/halonic-ci/slots` (the list of slot units) and `/etc/halonic-ci/site.nft` (the server's
public range for the nftables rules).

**The shared caches are writable from every job that runs here.** Every container mounts
`/cache/trusted/pnpm-store` and `/cache/trusted/ms-playwright` read-write, so a job can change
what later jobs read from them. That's acceptable only because the hook admits nothing but reviewed
code (pushes to `main`, later merge groups). pnpm checks each package against the lockfile's
integrity hash; the Playwright browsers aren't checked. A pool for pull requests would get a
read-only snapshot instead (C2, C8), never these folders.

## One job, one container

`vm/halonic-runner-slot.sh` runs one cycle of a slot: it mints an App token, asks GitHub for a
just-in-time runner config (one runner, one job), starts `docker run --rm` of the image, waits
for it to exit and cleans up. systemd starts the next cycle.

| Slot | Label | CPUs | Memory (= swap) | Work dir |
| --- | --- | --- | --- | --- |
| `large-1` … `large-4` | `halonic-ci-large` | 12 | 9 GB | 20 GB |
| `small-1` … `small-3` | `halonic-ci-small` | 2 | 2 GB | 6 GB |

Every container: all capabilities dropped, `no-new-privileges`, Docker's default seccomp and
AppArmor profiles, `--pids-limit 8192`, no host devices, no Docker socket. The image
(`vm/Dockerfile`) has no `sudo` and no Docker, so `container:` and `services:` jobs fail, and the
e2e job's apt step is skipped on this runner (Playwright's libraries are preinstalled).

## Operating

- **App key:** the slot script refuses to start unless `/etc/halonic-ci/app.pem` is a root-owned
  `0400` file, and unless `/etc/subuid` has the `dockremap` range (userns-remap on).
- **Weekly audit (Timothy):** check the org audit log for any change to the `halonic-ci` runner
  group (repositories, workflows, public repos) and to the `halonic-ci-runners` App (C6).
- **Kill switch:** clear `CI_RUNNER_LARGE` and `CI_RUNNER_SMALL` (the next runs go back to
  GitHub-hosted). On the VM: `touch /etc/halonic-ci/paused` and stop the slots. If the VM is
  suspected compromised, also revoke the App key and rotate the Turbo signing key.
- **Merge groups on:** `ALLOWED_EVENTS="push merge_group"` in the VM's
  `/etc/halonic-ci/pool/pool.conf` (applies at once), only after Julian has checked T1 and the
  queue gate refuses cross-repository pull requests (C7).
- **Runner update:** new version and checksum in `vm/Dockerfile`, build the image in the VM,
  set `IMAGE=` in `pool.env`, restart the slots.
- **Weekly** (`vm/halonic-ci-maint.timer`, Sunday 04:00): prunes images and stale work dirs. When
  `/cache` is over 75 %, it pauses the slots, lets running jobs finish (up to 2 hours), empties the
  shared caches and starts the slots again.
- **Firewall first:** `host/halonic-ci-nft.service` is required by `libvirtd.service`. If the rules
  don't load (a missing `/etc/halonic-ci/site.nft`, say), libvirtd and the CI VM don't start.
  The unit has no stop command: stopping it leaves the rules in place, because the VM keeps
  running without libvirtd. After editing the rules, `systemctl reload halonic-ci-nft` swaps them
  in one step, and a file that doesn't load keeps the old ones.
- **Status:** the host writes `/srv/ci/status/ci-status.json` and `jobs.jsonl` (per job: event,
  ref, seconds, `mem_peak`, `cpu_seconds`). On GitHub, a job's `runnerName` starting with `hci-`
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
- The queue gate refusing cross-repository pull requests (C7), and the real-fork test (T1).
