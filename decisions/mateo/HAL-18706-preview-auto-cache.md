# Decision: preview builds start after merges to main and share main's Rust cache

- Approval: the board's request on HAL-18705 (quicker preview builds, built on HAL-18706); Liam approves and signs this note in review, Julian checks the cache safety on HAL-18706
- Kind: internal

## What changes

`.github/workflows/studio-preview.yml` starts by itself on a push to `main` that changes
`apps/studio/**`, `packages/**`, `pnpm-lock.yaml` or the workflow; it can still be started by hand.

Its `installer` job restores the `rust-installer-<os>-<Cargo.lock + toolchain>` cache that CI's
`installer-windows` job already keeps, and saves it only when the run is on `refs/heads/main` and
the key wasn't an exact hit. A run on any other branch only reads main's copy; pull request and
merge-queue runs can't write main's cache scope at all. The `publish` job doesn't change: it
restores no cache, is still the only job with secrets, and signs the installer artifact the
`installer` job uploaded.

Concurrency moves from the workflow to the jobs: one build per branch at a time and one publish at a
time. A newer run replaces a build that is still waiting. Neither a running build nor a running
publish is cancelled.

## Why

The board asked for quicker previews. A build waited until someone started it, and "Build the
installer" took about 9 of the run's 12 minutes, with no cache.

A cache in a build whose output gets signed is only as safe as whoever can write the cache. Here
only `main` writes it, the same rule CI's installer job already follows; `release.yml` still
restores no cache, so a stable release never starts from it. The Preview key signs only Preview
builds (HAL-18477).

The build isn't cancelled while it runs, although HAL-18706 first asked for that: `main` takes
about 18 merges an hour, most of them under `packages/`, so cancelling running builds would let
almost none finish.

## Tests

`apps/studio/src/studio/preview-auto-build.test.ts` (`studio.preview-auto-build`), and
`apps/studio/src/studio/preview-publish.test.ts` (`studio.preview-publish`) unchanged.

## Covers

- .github/
