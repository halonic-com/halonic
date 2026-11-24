# Decision: the merge base's tests take main's own results instead of testing again

- Task: HAL-17657 (the board made "Merge base's tests" its first part, fast-track)
- Approval: HAL-17657; Liam reviews the CI design and signs this note as the CTO; Julian checks which runs' results are accepted
- Kind: internal

## What changes

In `.github/workflows/ci.yml`, `base-tests` ("Merge base's tests (no cache)") gets a step right
after it switches to the merge base, "Reuse main's test results for the merge base". For a pull
request into `main` it walks `main`'s first-parent history from the merge base, at most 20 commits
back, and takes the first commit that has a run which:

- is a run of `.github/workflows/ci.yml` (listed through that workflow, and its `path` checked),
- has event `push` with head branch `main`, or event `merge_group` with a head branch starting
  `gh-readonly-queue/main/`,
- belongs to this repository (`repository` and `head_repository`),
- has that exact commit as its head SHA, and ended `completed` / `success`,
- and still holds a `test-results-<shard>` artifact for every shard in `BUILD_SHARDS`, not expired,
  whose own `workflow_run` names that run and that commit.

It downloads those archives, checks each holds only plain `…/test-results/vitest.json` files that
land where their names say (the same check the guard makes on the pull request's archives), and
only when all pass unpacks them into the checkout. The step then reports that commit as `sha`, and
the red-base walk-back, pnpm, the install, the affected-tests choice and the test run are skipped.
The existing pack and upload steps send the results to the guard by artifact ID and sha256, as
before. When no commit within 20 qualifies, a lookup or download fails, or an archive is refused,
nothing is unpacked and the job tests the merge base exactly as it did. A pull request into another
branch (a stack, a release branch) always tests its merge base.

`tooling/check` gets the requirement `check.base-tests-reuse-main` and
`ci-base-tests-reuse.test.ts`, which runs the step's script against a stand-in GitHub API.
`docs/guides/broken-main.md` and `docs/guides/checks.md` say when the job reuses.

## Why

The board measured "Merge base's tests" at 17–23 min in 10 of 30 pull request runs on 24 Nov.
Measured on 81 runs that day: no run reused anything. The fast ones simply had 0–3 affected
packages to test; 63 of 81 took 10 min or more, because the pull request touched a package about
100 others depend on (104 packages tested), or changed `ci.yml` or root config (every package).
None was slow for a missing or expired result, a red base or a `main` that had just moved: there
was nothing to reuse. One run (#5700) took 34 min because the merge base's tests failed on a GitHub
runner although `main`'s merge group for that commit had passed, and it walked back and tested
everything again.

In 68 of the 81 runs (84%) the merge base had a green merge-group run with all nine shard archives
still there. The other 13 were pull requests into another branch (stacks, a release branch), which
have no run on `main` to take results from. So about 84% of these runs would have taken under a
minute instead of 15–26.

**Waiting for a run instead:** not needed. `main` moves only when the merge-group run for the new
commit has passed, and its build shards upload their results before that. All 19 merge bases on
`main` in the sample had a finished green merge-group run when the pull request's run started.

## What the no-cache rule protected, and why it still holds

The job reads no Turbo cache and no pnpm store because a pull request's own runs can write both,
so a cached result could come from code nobody reviewed. That stays true for this job: it still
runs no pull-request code, reads no cache, and, when it tests, tests with `--force`.

The reused results come from `main`'s own runs. Their build shards do use Turbo's cache, but only
caches that reviewed code writes: the remote cache's shared area only takes uploads from a push to
`main`, the merge queue reads its own area and `main`'s and uploads only to its own (HAL-14149),
the CI server's disk cache only takes writes from `main` and merge groups (HAL-15467), and GitHub's
cache is scoped per branch, so a pull request's copy is never read there. A pull request's run can
upload artifacts named `test-results-*`, but only into its own run, and the step reads artifacts
only from a run it has checked by event, workflow path, head branch, repository and head SHA, and
only artifacts whose own `workflow_run` matches that run and commit.

## How the guard's comparison stays correct

- The merge-group run for commit M tested M itself (the merge-group head becomes `main` as is), and
  every package, not just the affected ones. The guard compares only the affected packages, so
  more results are harmless, as the job's comments already say.
- The job reports the commit whose results it took as `sha`, and the commit the merge ref was built
  on as `built-on`. When it walks back, the two differ and the guard compares files with `built-on`
  and test results with `sha`, as after the existing walk-backs (HAL-7660).
- An archive missing a package fails the guard on that package, never passes it silently.

## Covers

- .github/
- tooling/check/
