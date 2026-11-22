# Decision: the fast pool's overlays read a snapshot of the shared caches, not the live folder

- Task: HAL-16032 (Julian's N1 in his C1–C8 review on HAL-15972)
- Approval: follow-up to the board's approval of the fast pool (HAL-15972, Timothy, 22 Nov); Liam signs this note in review, Julian re-checks C2 on the task
- Kind: internal
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:OypibRVBz6B5274N2UjsV2ydMxU8QP4g1C+uCk8FzYHIXFpzCaeArHiFIaz7SaJA1lFPoSHPhUHLczC2OhWBBw==

## What changes

- `infra/ci-runner/vm/halonic-ci-fast-lower.sh` (new): `refresh` copies `/cache/trusted/{pnpm-store,turbo,ms-playwright}`
  into a new generation `/cache/fast-lower/<n>` with `cp -a --reflink=always`, drops every file
  whose inode changed from 2 minutes before the copy on, and points `/cache/fast-lower/current` at
  it; it deletes old generations no overlay mounts any more. `current` prints the current
  generation, making the first one if there is none. The copy and the clean-up run as the runner's
  uid through `setpriv`, never as root, and the clean-up deletes only paths whose folder resolves
  inside the new generation.
- `vm/halonic-runner-slot.sh`: a fast slot's overlays use the current generation as their lower
  layer instead of `/cache/trusted`, read and mounted under a shared lock that refresh takes
  exclusive to delete a generation.
- `vm/halonic-ci-maint.sh`: the hourly cache check and the weekly cleanup refresh the snapshot
  once fast slots are listed in `/etc/halonic-ci/slots`. A failed refresh keeps the last
  generation and is logged.
- Tests: `fast-lower.test.mjs` (new, imported by `hook.test.mjs` so CI's `fast` job runs it). In
  `fast-pool.test.mjs`, one assertion follows the code: the overlay's lower layer is now
  `$LOWER_GEN/$c`, not `$TRUSTED/$c`; the new tests check that no slot mounts `$TRUSTED` as a
  lower layer. Also in `fast-pool.test.mjs`, a new test for Julian's gap on HAL-15972: the hook's
  `cache_safe` counts a `9p` cache mount as safe on the fast pool only.
- `README.md`: the snapshot, and a switch-on step that installs it and checks XFS reflinks.

## Why

Merge-group jobs keep writing to `/cache/trusted` while fast overlays are mounted. The kernel
treats a lower layer that changes under a mounted overlay as undefined behaviour, so a fast-track
pull request could read a half-written pnpm or Turbo entry and fail, or pass, for no reason. A
generation nothing changes once it's published removes that. Reflinks make a generation cheap on
XFS. Files that changed just before or during the copy are left out because they may have been
copied half-written; a missing entry costs a cache miss, a torn one a wrong result.

Running the copy as root over a folder jobs can write would let a job swap a folder for a link
mid-copy and have a root-only VM file (the App key) copied where fast jobs read it. Running it as
the runner's uid limits it to what jobs can already read.

Nothing changes on the server when this merges: fast slots aren't deployed yet, and the hourly
refresh starts only once they're listed in `/etc/halonic-ci/slots`.

## Tests

No test was weakened or skipped. One assertion follows the code (above); 8 tests are new.
`node --test infra/ci-runner/hook.test.mjs`: 53 pass. Removing the clean-up's folder check makes
the swapped-link test fail; dropping the `fast` condition from `cache_safe` makes the `9p` test fail. Real reflinks, `setpriv` and overlays aren't in CI (the tests stub
them); the README's switch-on steps run a refresh on the VM before the smoke test.

## Covers

- infra/ci-runner/fast-pool.test.mjs
