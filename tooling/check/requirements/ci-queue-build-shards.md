# check.ci-queue-build-shards

- Status: active
- Since: unreleased
- Source: HAL-17908 (item 6 of the merge-time report, HAL-17891, 24 Nov); a fifth line for the Studio split, HAL-19508 (CI sweep of 26 Nov on HAL-18424)

When `.github/workflows/ci.yml` runs the `build` job in a merge group or on a push, it shall run one job per line of `QUEUE_BUILD_SHARDS` (three to five lines, each joining whole shards of `BUILD_SHARDS`), the `trace` job and the `base-tests` job's reuse of main's results shall read the test results by those names, and on a pull request the `build` job shall keep one job per line of `BUILD_SHARDS` and check that both lists hold every package exactly once.

## Examples

- Given a merge group,
  when CI runs,
  then the build job runs five shards (`adapters-core`, `studio-features`, `studio-testing`, `apps-host-tooling`, `app-studio`) and `trace` reads those five test-result archives.
- Given a pull request,
  when CI runs,
  then the build job runs the nine shards of `BUILD_SHARDS`, and its first shard fails if a package is missing from, or in two shards of, either list.
- Given a pull request whose merge base passed its merge group with the five queue shards,
  when the merge base's tests run,
  then they reuse that run's five test-result archives instead of testing again.
