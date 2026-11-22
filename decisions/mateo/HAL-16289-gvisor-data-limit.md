# Decision: the typed-array data limit test skips where `prlimit --data` doesn't hold

- Approval: https://paperclip.halonic.com/HAL/issues/HAL-16289 (CI fix for the fast pool, a team decision); the reviewer signs this note with the pull request
- Kind: internal

## What changes

`integration-runner.heap-limit`'s Linux test "stops an integration that keeps typed arrays at the data limit with a
RangeError" first checks whether this machine enforces `prlimit --data` at all: plain Node under a 928 MiB data
limit allocates 2 GiB of typed arrays. If that ends without an error, the test skips with a note naming gVisor and
HAL-16289; otherwise it runs as before.

Why: the fast pool (HAL-15972) runs pull request jobs under gVisor (`runsc`), and there the data limit doesn't reach
the memory behind typed arrays. So the test failed on every fast-track pull request whose change lets it run, for
example #3895, which only changes the lockfile, while the same test passed on `ubuntu-24.04` in the same run.

No coverage is lost where it counts: the probe checks the machine, not the runner, so a runner that loses its limit
still fails the test wherever the limit holds. That is GitHub's `ubuntu-24.04` and our large pool (runc), where
every merge group runs it; it passed there in today's merge groups. A probe that can't start counts as "holds", so
the test runs and fails as before.

## Covers

- packages/adapters/integration-runner/src/runner-file.test.ts
