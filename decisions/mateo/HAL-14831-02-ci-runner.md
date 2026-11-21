# Decision: the self-hosted CI runner setup goes into infra/ci-runner/ as built, with a test of its job-started hook

- Task: HAL-14831 (plan revision 2, Julian's security verdict "approved with changes", the board's notes of 21 Nov that the runners are built and the files handed over)
- Approval: the board asked for the as-built setup as a reviewed PR (HAL-14831, 21 Nov); Liam signs this note in review, then Julian checks it against C1–C6
- Kind: internal

## What changes

- `infra/ci-runner/` holds the CI server's scripts as built: the image (`vm/Dockerfile`, `vm/entry.sh`),
  the job-started hook (`vm/job-started.sh`) and its `pool.conf`, the slot script and unit, the weekly
  cleanup, the status feed and the host's nftables rules. Two edits from what runs today, both deployed
  by the board supervisor after merge: the nftables rules read the server's public range from a site
  file (`/etc/halonic-ci/site.nft`) instead of naming it, so the public repo doesn't list the server's
  addresses; and the image no longer names fixed paths where it doesn't have to (below), with the slot
  script naming the container's work dir once (`JOB_WORK`).
- `infra/ci-runner/hook.test.mjs` runs the shipped hook against sample events: it accepts only
  `ci.yml` on a push to `main` (and on a merge group to `main` once `pool.conf` lists it), and refuses
  every pull request, a fork pull request posing as a merge group or a push, other branches, workflows,
  repositories and events, a moved or missing event file, a missing or writable pool file, and a
  missing `jq`. It also checks the image and the slot script for the C5 hardening. The `fast` job's
  infra step runs it.
- `tooling/check`'s `absolute-paths` rule now accepts a line with the leak guard's inline marker
  (`leak-guard: allow absolute-path <reason>`), as `AGENTS.md` already describes for absolute paths.
  Before, the marker satisfied the leak guard but not `pnpm check`, so a path that only exists inside
  a container image (the runner's home folder) had no allowed form outside a test file. New
  requirement `check.absolute-paths-inline-allow`, with its test.
- No allow-list entries: the image builds in its own folder instead of `/tmp`, reaches the runner's
  home through `~runner` and `$HOME`, and `entry.sh` changes into the runner folder itself. The few
  fixed in-image paths left (the hook's event path, the slot script's `JOB_WORK`, the host's status
  key) carry the inline marker.

## Why

The board built the runners from its own copies of the scripts, ahead of review. The boundary that
keeps fork and pull request code off the server is the hook, so it needs a reviewed home in the repo
and a test that fails when it lets the wrong job through. Changes after this merge are made here and
deployed from here.

## Tests

No test was weakened or skipped. `infra/ci-runner/hook.test.mjs` is new, and
`check.absolute-paths-inline-allow` comes with its own test.

## Covers

- .github/
- tooling/check/
- check.absolute-paths-inline-allow
