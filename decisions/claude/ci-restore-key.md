# Decision: a pull request's build first restores the Turbo cache of the main it was merged with

- Approval: Liam (workflow), for HAL-18424
- Kind: internal
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:q18WKUANw1k5mKPFIklTC53++0n6wR9bDtuNiSiDen4vXgqhbvY2pNw0PboFkLbmdspOZQ0sjQAe7atCw9z9Ag==

## What changes

The `build` job in `.github/workflows/ci.yml` gets a step, on `pull_request` runs that use
GitHub's cache, that reads the merge commit's first parent (`git rev-parse HEAD^1`): the
`main` the pull request was merged with. The Turbo restore then asks first for
`turbo-<os>-<shard>-<that sha>`, the entry `pr-turbo-cache` saved for that push to `main`,
and only then for the prefix `turbo-<os>-<shard>-` (the newest entry). The path
(`.turbo/cache`) and the primary key are unchanged. Merge groups and pushes are unchanged:
they use the server's disk cache, and on GitHub's runners their newest entry is their own
branch's latest. A new test in `tooling/check/src/test/ci-pr-turbo-cache.test.ts` pins the
step and the key order; `docs/guides/checks.md` says so.

## Why

A pull request's `github.sha` is its merge commit, which never has an entry, so the prefix
restored the newest entry. Since `pr-turbo-cache` copies on every push to `main`, that is often
a later `main` than the one the pull request was merged with, and its tasks miss. On 25 Nov,
7 of 27 pull request runs restored the wrong entry and got 0–51% of tasks cached; three
branches ran the same merge commit twice and got 78–100% with the matching entry and 0–3%
with the newest.

## Security

Pull requests still only restore; nothing new is saved, no new permissions or secrets. The
extra step runs `git rev-parse` on the checked-out merge ref (fetched with depth 2 already).

## Covers

- .github/
- tooling/check/
