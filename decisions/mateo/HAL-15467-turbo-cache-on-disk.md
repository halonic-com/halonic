# Decision: the build shards keep Turbo's cache on our CI server's disk

- Approval: HAL-15467 (the board's decision, 21 Nov); Liam approves this note in review on HAL-15467 and signs it
- Kind: internal
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:E17Plb3wsNReid3MPBViQfiF35IDmOmchNX+lJJXhpXNnCZv+oTfVGLkZ34z5bK1aX4qm+/w8LXcPB6J22Y3CA==

## What changes

In `.github/workflows/ci.yml`, the `Typecheck, lint, test, build` job gets a step that chooses
`TURBO_CACHE_DIR`. On our own CI server (`runner.environment == 'self-hosted'`) it is
`/cache/turbo`, a folder on the server's cache disk (`/cache/trusted/turbo` on the VM) that every
slot mounts read-write and keeps between jobs. There the `actions/cache` restore and save of the
Turbo cache are skipped. If `/cache/turbo` isn't mounted or writable, the job says so in a warning
and uses `actions/cache` as before. On GitHub's runners nothing changes: the same folder, the same
restore, and the save on `main` only. The remote cache (`TURBO_API`) is unchanged.

`infra/ci-runner/vm/halonic-ci-maint.sh` deletes Turbo entries unused for 7 days every week and
empties the folder with the other shared caches when the 20 GB quota passes 80 %. The VM's slot
script gets the mount from the board's CI session before this merges.

No trigger, permission, secret, environment or required check changes.

## Why

On our runners the fixed cost of a build shard is about 30 s, and about 15 s of it is fetching and
saving the Turbo cache through GitHub's cache service (2 runs, 27 jobs). That is about 11
slot-minutes per merge group.

## Safety

Only pushes to `main` and merge groups ever run on our runners: the runner hook refuses every
other event. So the shared folder only ever holds the results of reviewed code, the same as the
pnpm store and the Playwright browsers next to it. Unlike the remote cache, the folder has no
queue area (HAL-14149): `main` can read what a merge group wrote, also from an entry that failed
and never merged, and Turbo's local entries aren't signed. That is the trust the server already
gives the pnpm store, and `infra/ci-runner/README.md` and `docs/guides/checks.md` say it. Pull
requests never run on our runners and never see the folder.

## Tests

No test was weakened or skipped. `infra/ci-runner/hook.test.mjs` checks that the cleanup empties
the Turbo folder too. The merge-group run after the merge shows the restore and save steps
skipped and the shard times; it goes on HAL-15467.

## Covers

- .github/
