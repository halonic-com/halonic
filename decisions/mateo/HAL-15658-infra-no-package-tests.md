# Decision: a change under infra/spend-guard/ or infra/turbo-cache/ tests no package

- Task: HAL-15658
- Approval: follows Liam's decision on HAL-15286 (21 Nov) for `infra/ci-runner/` (HAL-15356, #4620), which scoped that PR to `ci-runner` only. `tooling/check/src/lib/affected-tests.ts` is a guard trust root, so this note needs both guardians: Liam (CTO) and Julian (security reviewer)
- Kind: user-visible
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:eIaKhvZgOlHCSBgTWO27qS/fQ7ljhecAmUxUXYlmVqualej+3tPLCwtr9I0Q07LZLumOAdfLwQmhKSrHnH2zAA==
- Signature: ed25519:sha256:s6QbTuo7EHJ-9JxW-RnqP0pi0Jq_Jkrdog_YTzYt1lI:oePwJ1KJldu1IZ0ovGG2bKi2Q9aEqcUOIN1YKMiyY9y2dQQ3QIAM/eGkPgyMjfcOjsUF4AOf1zCxUYuD2CLvCA==

## What changes

- `tooling/check/src/lib/affected-tests.ts`: `noPackageTestPaths` now also holds
  `infra/spend-guard/` and `infra/turbo-cache/`. A changed file under either selects no
  package's tests, as a doc or a file under `infra/ci-runner/` does. `infra/wsl-image/` still
  selects every package, and so does any other file outside every package that isn't docs.
- `check.affected-tests` says so, with an example for it. Its example of a file that tests
  everything moves from `infra/turbo-cache/` to `infra/wsl-image/`. Nothing else it says is
  removed or weakened.
- `docs/guides/checks.md` names both folders.

## Why

Both folders hold Cloudflare workers. No package's tests read them, and their own tests
(`infra/spend-guard/test/guard.test.mjs`, `infra/turbo-cache/test.mjs`) run in the fast gates'
"Infra tests" step whatever the selection says. Until now any change there selected every
package, so the merge base's uncached tests ran all of them, which took past 20 minutes under
load (#4742, HAL-15658). `infra/wsl-image/` stays as it is, because `sandbox-srt` and the agent
host use its scripts. The merge queue and `main` still test every package.

## Tests

No test was weakened or skipped. The test that a file outside every package selects every
package now uses `infra/wsl-image/`. A new test covers a change under both worker folders and a
look-alike folder name. The existing check against the real repo, that no package's test names
a path in `noPackageTestPaths`, now covers both folders.

## Covers

- tooling/check/
- check.affected-tests
