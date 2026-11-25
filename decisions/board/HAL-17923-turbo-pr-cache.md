# Decision: pull requests on GitHub's runners read main's Turbo results again

- Task: HAL-17923 (from the merge-time report on HAL-17891, section 7.2; Chief's go, 24 Nov)
- Approval: Chief gave the board server session this item on HAL-17891 (24 Nov); Liam signs this note in review
- Kind: internal
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:PPeuL6WUI0yMAP6XcIf+x1jRL29HIxt3pk8OHz0tt07Mr9Wh3oUtFCjBlXbiwS3LmjKhnzluzVE9iDH/AyHRAg==

## What changes

- `.github/workflows/ci.yml`: a new job, `pr-turbo-cache` ("Turbo results for pull requests"), on
  a push to `main` only, with the large pool's routing expression (`check.ci-self-hosted-routing`
  lists it with the large jobs). On our CI server, at most once per `CI_PR_TURBO_CACHE_MINUTES`
  (repo variable, 50 by default), it lists each build shard's task hashes with a Turbo dry run,
  copies the entries that exist in the server's disk cache (`/cache/turbo`, which only `main` and
  the merge queue write), and saves one GitHub cache entry per shard under the key the `build`
  job restores (`turbo-<os>-<shard>-<sha>`). It builds nothing and `ci-ok` doesn't need it. On
  GitHub's runners it does nothing.
- The `build` job's Turbo cache restore and save use the relative path `.turbo/cache` instead of
  `${{ env.TURBO_CACHE_DIR }}`. It is the same folder on GitHub's runners, but actions/cache keys
  an entry on its path strings, and the absolute path differs on our server.
- The comment above the save step said the remote cache serves pull requests main's results; it
  doesn't (a pull request gets no token), so it now says what serves them.
- New requirement `check.ci-pr-turbo-cache` with its test; `docs/guides/checks.md` describes the
  job and drops the stale line that a pull request saves its own Turbo copy.

**Trust:** a pull request still reads only `main`'s scope of GitHub's cache and can't write it.
What the job copies comes from the server's disk cache, which holds only results of reviewed code
(pushes to `main` and merge groups; the runner hook refuses everything else, and the fast pool sees
it read-only through an overlay). Release builds don't read Turbo's GitHub cache.

## Why

The follow-up measurements on HAL-17891 found that pull requests on GitHub's runners hit Turbo's
cache on about 1% of tasks, against 80% in merge groups. Only a push to `main` on GitHub's runners
ever saved that cache. Since 21 Nov `main`'s build runs on our server, which keeps its cache on
disk and saves nothing (HAL-15467), and a push to `main` skips the build its merge group already
ran (HAL-15465), so the cache has not been refreshed since. A pull request's run rebuilds, lints
and tests every package: about 3 minutes per shard, the run's floor. Expected: build shards
2–5 → 1–2.5 min on pull requests whose change doesn't touch a global input or `codegen`'s inputs
(about 75% of pull requests), and about 25–30 GitHub runner-minutes saved per run.

## Tests

No test was skipped or weakened. `ci-self-hosted-routing.test.ts` adds `pr-turbo-cache` to the
jobs that must use the large pool's expression. `ci-pr-turbo-cache.test.ts` (new, 4 tests): the job
runs only on a push to `main`; it saves one entry per shard in `BUILD_SHARDS`, all with path
`.turbo/cache`, under the key the `build` job restores, which also uses `.turbo/cache`; every
Turbo call in it is a dry run; `ci-ok` doesn't need it. `tooling/check`'s `ci-*` tests: 10 files,
63 tests pass.

## Covers

- check.ci-self-hosted-routing
- .github/
- tooling/check/
