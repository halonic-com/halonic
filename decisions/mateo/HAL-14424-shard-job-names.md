# Decision: the nightly recognises the build job's shards

- Approval: the task asks for this change (HAL-14424, from Liam's review of #4151); Liam reviews it and signs this note as the CTO
- Kind: internal

#4151 (HAL-14115) splits "Typecheck, lint, test, build" into one job per
shard, named "Typecheck, lint, test, build (<shard>)". The nightly's
`main-failures` matched the jobs that test every package by their exact
name, so a failing shard on `main` went to "Shared code and everything
else" instead of the failing package's area, and its log wasn't fetched.

`testsEveryPackage` now accepts a name from `everyPackageJobs` or that name
followed by ` (`, so both the old single job and its shards are routed by
the failing package. "Merge base's tests (no cache)" keeps matching exactly.
The requirement `check.main-failures` says so and gets one more example, with
a test. `docs/guides/area-owners.md` and `docs/guides/broken-main.md` name
the shards.

`infra/cf-runner/README.md` also named the single job, but #4159
(HAL-14120) deleted that folder, so there is nothing to change there.

## Covers

- check.main-failures
- tooling/check/
