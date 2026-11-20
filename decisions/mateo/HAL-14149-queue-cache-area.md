# Decision: the merge queue writes the remote cache, but only its own area

- Approval: Julian's decision on HAL-14149 (20 Nov, option 3, as guard and security owner), step 4 of the board's decision on HAL-14115; Liam approves this note in review and signs it, Julian reviews the pull request on its own review task
- Kind: internal

## What changes

In `.github/workflows/ci.yml`, the `Typecheck, lint, test, build` job runs the merge queue with
`--cache=local:rw,remote:rw`, as a push to `main` already does. Before, the queue ran with
`remote:r`. The comments on the job's environment and on the remote-cache step say what the
queue's token can do now. The unused `EVENT` variable of that step goes.

What the queue may write is decided in the cache Worker (`infra/turbo-cache/worker.mjs`, same
pull request), not in `ci.yml`: the Worker now gives a `merge_group` token on
`gh-readonly-queue/main/*` a `q.` token instead of an `r.` token. A `q.` token uploads only to
`q/<hash>` and reads `q/<hash>` first, then `<hash>`. Write and read tokens never see `q/`, so
`main` never trusts what the queue uploaded. The bucket deletes `q/` objects after 7 days.

No trigger, environment, right or secret changes. The queue already held the signing key
(`turbo-cache-write`), and pull requests and other pushes still hold neither secret. Only this
job uses the remote cache; no other workflow (release, publish) does, and none may without a
new decision (`docs/adr/2026-11-20-the-merge-queue-writes-only-its-own-cache-area.md`).

## Why

When merges come fast, `main`'s runs are cancelled while waiting, so the remote cache lags
`main` by several merges and a group deep in the queue rebuilds what the groups ahead of it
just built (group `5c6ca4cc`: 62% of tasks reused from `main`'s entries). With its own area,
each queue entry also reuses the entries ahead of it. Julian chose this over letting the queue
write the shared area: a queue token there could overwrite `main`'s entry for any hash, and a
group that fails on purpose after uploading would leave its entries behind with no trace in
`main`'s history.

## Tests

No test was weakened or skipped. `infra/turbo-cache/test.mjs` (run by the Fast gates job)
checks that the queue's uploads stay in `q/` and leave `main`'s entry alone, that `main` and
the read token miss queue-only entries, that the queue falls back to `main`'s entry, that the
lookup follows the same rules, that no token can name a `q/` key, and that a pushed look-alike
branch or a `merge_group` claim on `main` gets no token. The tests fail if the queue writes
`<hash>` or if `main` reads `q/`.

## Covers

- .github/
