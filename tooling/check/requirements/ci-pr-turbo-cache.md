# check.ci-pr-turbo-cache

- Status: active
- Since: unreleased
- Source: HAL-17923 (board session; Chief's decision on HAL-17891, 24 Nov)

When a push to `main` runs `.github/workflows/ci.yml` on our own CI server, the `pr-turbo-cache` job shall, at most once per `CI_PR_TURBO_CACHE_MINUTES` (50 by default), copy each build shard's task results that exist in the server's disk cache into GitHub's cache, under the key and path the `build` job restores (`turbo-<os>-<shard>-<sha>`, path `.turbo/cache`); it shall build nothing, run on no other event, and never be required by `ci-ok`.

## Examples

- Given a push to `main` on our CI server and no copy saved in the last 50 minutes,
  when CI runs,
  then `pr-turbo-cache` saves one GitHub cache entry per build shard, holding only the shard's current task results from the disk cache.
- Given a pull request on GitHub's runners after such a push,
  when its `build` job restores `turbo-Linux-<shard>-`,
  then it finds main's copy and its unchanged packages are cache hits.
- Given a push to `main` 20 minutes after the last copy, or a push that runs on GitHub's runners,
  when CI runs,
  then `pr-turbo-cache` saves nothing and passes.
- Given a pull request or a merge group,
  when CI runs,
  then `pr-turbo-cache` is skipped.
