# Decision: a change under infra/ci-runner/ tests no package

- Task: HAL-15356
- Approval: Liam's decision on HAL-15286 (21 Nov): don't raise the 20-minute limit of the merge base's tests, map `infra/ci-runner/` to "no package tests" instead. `tooling/check/src/lib/affected-tests.ts` is a guard trust root, so this note needs both guardians: Liam (CTO) and Julian (security reviewer)
- Kind: user-visible
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:5yo9OVYy+yEJLO848+U4YQsZp40KPouHkP/HEKLlle6XFjeVrmKEMBb/4E586Ad+c+dJnk2z/ZreuW3hXV52BA==

## What changes

- `tooling/check/src/lib/affected-tests.ts`: a new list, `noPackageTestPaths`, holds
  `infra/ci-runner/`. A changed file under it selects no package's tests, as a doc does.
  Every other folder under `infra/` still selects every package, and so does any other file
  outside every package that isn't docs.
- `check.affected-tests` says so, with an example for it. Nothing else it says is removed or
  weakened.
- `docs/guides/checks.md` names the exception.

## Why

`infra/ci-runner/` holds the CI server's scripts and unit files. No package's tests read them,
and their only test, `hook.test.mjs`, runs in the fast gates' "Infra tests" step whatever the
selection says. Until now any change there selected all 102 packages, so the merge base's
uncached tests could hit their 20-minute limit, as on #4574. The merge queue and `main` still
test every package.

## Tests

No test was weakened or skipped. New tests cover a change under `infra/ci-runner/` alone, one
together with a package, a look-alike folder name, and a check against the real repo that no
package's test names a path in `noPackageTestPaths`.

## Covers

- tooling/check/
- check.affected-tests
