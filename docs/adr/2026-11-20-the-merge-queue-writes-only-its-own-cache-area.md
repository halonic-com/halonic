# The merge queue writes only its own area of the remote cache

- **Status:** Proposed
- **Date:** 2026-11-20

## Context

The merge queue is the slowest step to `main` (HAL-14115). Only a push to
`main` could write the Turbo remote cache (`infra/turbo-cache`); the queue got
a read token, because it runs the queued change's own code (HAL-5220). When
merges come fast, `main`'s runs are cancelled while waiting, so the cache lags
`main` by several merges and a group deep in the queue rebuilds what the
groups ahead of it just built. We looked at three options (HAL-14149): keep
the queue read-only and make `main` faster, let the queue write the shared
cache, or give the queue an area of its own. The second gives the most, but a
queued change's code would hold a token that can overwrite `main`'s entry for
any hash, and a group that fails on purpose after uploading leaves its entries
behind with no trace in `main`'s history. The signing key doesn't help: the
queue already holds it, to verify entries.

## Decision

**The queue writes only `q/<hash>`, and only the queue reads it.** The cache
Worker gives a `merge_group` OIDC token on `gh-readonly-queue/main/*` a
30-minute `q.` token. A `q.` token uploads to `q/<hash>` and reads `q/<hash>`
first, then `<hash>`, for `GET`, `HEAD` and the `POST /v8/artifacts` lookup.
Write (`w.`) and read (`r.`, `TURBO_TOKEN_READ`) tokens never read or write
`q/`. A push to `main` keeps its `w.` token and is unchanged. The bucket
deletes `q/` objects after 7 days.

**Only `ci.yml`'s `build` job uses the remote cache.** No other workflow
(release, publish) uses it, and none may without a new record: the rules above
only cover that job.

## Consequences

Each queue entry reuses what the entries ahead of it built, which is most of
the gain of letting the queue write. `main` gives up reusing the queue's
results, and trusts only what a push to `main` built, as before. If a task's
output depends on something that differs between a queue run and a push but
isn't in its hash, `main` never picks up the queue's copy. A bad entry
uploaded by queued code can still affect later queue entries for up to 7
days; it never reaches `main`. The Worker is the only gate: a hash can't
contain `/`, so no request names a `q/` key directly. Tests:
`infra/turbo-cache/test.mjs` (the queue's uploads stay in `q/`, `main` and the
read token never see `q/`, the queue falls back to `main`'s entry, a pushed
look-alike branch gets no token). Deploy the Worker and add the `q/` lifecycle
rule together (`infra/turbo-cache/README.md`).

## Changed from an earlier decision

Before, the merge queue got a read token (`r.`) and ran with `remote:r`
(HAL-5220). Now it gets a `q.` token and runs with `remote:rw`.
