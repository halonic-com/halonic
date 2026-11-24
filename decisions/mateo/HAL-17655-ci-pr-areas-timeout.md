# Decision: the ci-pr-areas installer test runs one case per file, so a busy CI shard stays under 30 s

- Approval: HAL-17655, a routine test fix under `tooling/check/`; Liam reviews the pull request and signs this note as the CTO
- Kind: internal
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:7BIacYHipgYpYRckaIlxjeIxC272gmDiumd/MylEQT7wKkbP9lHPy8Xk3zLe41r0zBbkzO98pHZjRjtS/q03Cg==

`tooling/check/src/test/ci-pr-areas.test.ts` checked the installer area for ten files in one test,
and each file builds its own throwaway git repo (about 13 processes). That is about 10 s on an idle
machine; on the fast pool's `tooling-targets` shard it took 43 s and 58 s and failed the 30 s limit
twice on #5663 (run 45413222722).

The loop becomes two `test.each` tables, one case per file, so each case has the 30 s to itself
(about 1 s each locally). The same ten files are checked with the same expected values; no case,
assertion or requirement is removed, and the requirement `check.ci-pr-areas` now runs 12 tests
instead of 3. The only `expect` change is that the file name moves from the assertion's message
into the test's name.

## Covers

- tooling/check/
