# action-catalog.github-merge-release-pr

- Status: active
- Since: unreleased
- Source: stream HAL-17488 (user-only action steppers); architecture note on HAL-17491, sections 1.2, 5 (row 8), 6.2 and 7.8; task HAL-17551

When a request names `github.merge-release-pr@1` with a GitHub `owner`, `repo`, a `pull_number`, the full head commit `sha` the request names and the `release_card` it comes from, the action-catalog package shall offer:

- a `check` step that reads `GET /repos/{owner}/{repo}/pulls/{pull_number}`, keeps only `state`, `merged`, `head.ref`, `base.ref`, `head.user.login` and `head.repo.name`, requires `state` to be `open`, and requires `head.user.login` to equal `owner` and `head.repo.name` to equal `repo`, so a fork's pull request is never merged as a release;
- a `check` step that reads `GET /repos/{owner}/{repo}/commits/pull/{pull_number}/head`, keeps only `sha`, requires the request's `expect` to name `sha`, and requires the kept `sha` to equal the `sha` parameter;
- a `call` step of risk `irreversible` that sends `PUT /repos/{owner}/{repo}/pulls/{pull_number}/merge` with that `sha` and `merge_method: squash`, so GitHub refuses the merge if the head moved after the check. The merge is direct: the REST API can't join a merge queue, so GitHub refuses it on a branch whose rules require one, unless the user may bypass those rules, in which case it skips the queue's required checks.

The stepper shall refuse the merge when the pull request's head differs from the request's `expect` ("This changed since the request: …"), when the head differs from the `sha` the merge sends ("The pull request's head commit isn't the one this request merges."), when the pull request isn't open ("This pull request is no longer open, so there is nothing to merge."), when its head is in another repository ("This pull request comes from another repository, so it isn't a release."), or when the request's `expect` has no `sha`. The preview shall name the repository, the pull request, its head and base branches as GitHub answered them and the full head commit, ask the user to check that the release card names that commit, and say that the merge is direct and what GitHub does on a branch that requires a merge queue; the merge's own line, which the confirm dialog shows, shall hold the full head commit and the release card. The summary shall say that the merge is direct and refused on a branch that requires a merge queue. The manual guide shall be a numbered list holding `https://github.com/{owner}/{repo}/pull/{pull_number}`, and cover the merge queue's **Merge when ready** button.

## Examples

- Given the recorded open pull request 12 of `acme/app`, from `release/1.4.0` into `main`, with head `4f2c9e1…`, and release card `ACME-12`,
  when both checks run and the merge is sent,
  then the preview reads "Pull request #12 of acme/app: `release/1.4.0` into `main`." and "Its head commit is `4f2c9e1b7a3d5c8e0f6a2b4d9c1e7f3a5b8d0c2e`. Check that release card `ACME-12` names this commit.", and the merge sends `sha: 4f2c9e1b7a3d5c8e0f6a2b4d9c1e7f3a5b8d0c2e`.
- Given a recorded pull request whose head is no longer the one in `expect`,
  when the gate is asked about the merge,
  then it stops at the second check with `This changed since the request: "sha".`
- Given a recorded pull request that is closed,
  when the gate is asked about the merge,
  then it stops at the first check with "This pull request is no longer open, so there is nothing to merge."
- Given a recorded open pull request whose head is in `acme-fork/app`,
  when the gate is asked about the merge,
  then it stops at the first check with "This pull request comes from another repository, so it isn't a release."
- Given a branch whose rules require a merge queue,
  when the merge is sent,
  then GitHub answers 405 and the stepper shows its message.
- Given a head that moves after the checks,
  when the merge is sent,
  then GitHub answers 409 and the stepper shows its message.
