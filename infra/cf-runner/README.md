# Cloudflare container runners (trial)

A trial (HAL-13578): merge-queue Linux jobs run on one-job Cloudflare containers instead of
waiting for one of GitHub's runners. Off unless the repository variable `CF_RUNNER` is
`merge-queue`.

Source: `worker.mjs` (Worker and the job Durable Objects), `ledger.mjs` (budget and parallel limit), `lib.mjs` (checks), `bootstrap.sh` (container
setup), `prefill.sh` (image B's warm pnpm store). Tests: `node --test infra/cf-runner/test.mjs` (no install, no network, no spend).

## How a job gets here

1. In `.github/workflows/ci.yml`, a job asks for the label `cf-linux` only when `CF_RUNNER` is
   `merge-queue` **and** the run is the merge queue or a push to `main`. Otherwise it asks for
   `ubuntu-24.04`, as before. Today: `Fast gates` and `Typecheck, lint, test, build`.
2. GitHub sends the GitHub App `halonic-cf-runner` a `workflow_job` webhook. The Worker checks
   the signature, that the job is queued and asks for `cf-linux`, and, from GitHub's API, that
   its run is `ci.yml`, as `merge_group` on `gh-readonly-queue/main/*` or `push` on `main` of
   `halonic-com/halonic`. Anything else is refused.
3. The Worker asks GitHub for a one-time runner registration (JIT config) in the org's runner
   group `cf-runner`, which only `halonic-com/halonic` may use. Its token lasts an hour and holds
   only "Self-hosted runners: write" (org) and "Actions: read" (this repository), no repository
   Administration. Then it starts one container (standard-4: 4 vCPU, 12 GiB,
   20 GB disk, `ubuntu:24.04`). `bootstrap.sh` installs git, Node 22 and the Actions runner,
   both checked against pinned SHA-256 sums.
4. The runner takes one job and deregisters itself; the container stops. Before the job's first
   step, a hook checks the job's event, branch and repository once more and fails anything
   that isn't the merge queue or `main`, before its code runs.
5. Every minute the Worker asks GitHub about the job and its runner. Any `cf-linux` job can
   take the runner, a pull request's too (the hook then fails it). If the runner is gone and
   the job is still queued, the Worker starts another container. If the job was cancelled or
   ran elsewhere and the runner is still idle, it stops the container.

Nothing persists between jobs: no volume, and a new container per job. The image holds no secret.
Job secrets reach the container the same way they reach GitHub's runners, for that job only.

## Two images

The trial compares two ways to start a job's container (board, 19 Nov):

- **A, plain:** `ubuntu:24.04`, set up per job by `bootstrap.sh` (about a minute).
- **B, pre-filled:** a snapshot of a container that already ran `bootstrap.sh` and `prefill.sh`
  on Cloudflare's managed `debian-trixie` image: the runner, Node, pnpm and a pnpm store filled
  from `main`'s lockfile. Jobs start from the snapshot and only start the runner. Snapshots need
  the `durable_object` scheduling policy, so B is a second container class, `RunnerJobB`.
  A Worker cron checks every 30 minutes and builds a new snapshot when `main`'s lockfile changed
  or the last one is a day old. The builder container never takes a job and holds no secret: it
  clones the public repository and installs with `--ignore-scripts`.

`IMAGE_B` in `wrangler.toml` picks which jobs get B: `off`, `alternate` (by run, so both jobs of
a run use the same image) or `all`. Without a snapshot every job gets A. Each job's log ends with
a `cf-runner image=… boot_to_job=… seconds=…` line with the measurements.

## Limits

- `CAP_USD` (18): no new container once the used time, plus an hour for every running
  container, would pass it, priced at $0.40 a container-hour. `GET /status` shows the total.
- `MAX_RUNNERS` (4): containers at the same time, snapshot builds included. A job beyond that
  waits, and is retried every 20 seconds for up to 45 minutes.
- The spend switch: `spend_ok` and `spend_ok:cf-runner` in the spend-guard KV must be `on`.

## Turning it off

Delete the repository variable `CF_RUNNER` (Settings > Secrets and variables > Actions >
Variables). New runs use GitHub's runners at once. A job already queued for `cf-linux` still
needs a container: leave the Worker running until those are done, or take the pull request
out of the queue and queue it again.

Deleting `CF_RUNNER` doesn't stop image B's snapshot builds: the cron doesn't read it. To stop
them too, set `IMAGE_B` to `off` in `wrangler.toml` and deploy, or turn `spend_ok:cf-runner` off.

## If the trial stays

- Put `GET /status` behind auth or drop it: today anyone can read the spend and job counts.
- Bump the pinned runner version (and its SHA-256) in `bootstrap.sh` regularly: GitHub stops
  accepting old runner versions a while after a new release.
- Consider a per-run label (`cf-linux-<run id>`) so a fork's job can't take a runner by asking
  for `cf-linux`. It changes `ci.yml`, so it needs a new signature on the decision note.
