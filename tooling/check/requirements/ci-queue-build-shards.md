# check.ci-queue-build-shards

- Status: active
- Since: unreleased
- Source: HAL-17908 (item 6 of the merge-time report, HAL-17891, 24 Nov)

When `.github/workflows/ci.yml` runs the `build` job in a merge group or on a push, it shall run one job per line of `QUEUE_BUILD_SHARDS` (three or four lines, each joining whole shards of `BUILD_SHARDS`), the `trace` job and the `base-tests` job's reuse of main's results shall read the test results by those names, and on a pull request the `build` job shall keep one job per line of `BUILD_SHARDS` and check that both lists hold every package exactly once.

## Examples

- Given a merge group,
  when CI runs,
  then the build job runs four shards (`adapters-core`, `studio`, `apps-host-tooling`, `app-studio`) and `trace` reads those four test-result archives.
- Given a pull request,
  when CI runs,
  then the build job runs the nine shards of `BUILD_SHARDS`, and its first shard fails if a package is missing from, or in two shards of, either list.
- Given a pull request whose merge base passed its merge group with the four queue shards,
  when the merge base's tests run,
  then they reuse that run's four test-result archives instead of testing again.
