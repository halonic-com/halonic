# action-catalog.github-merge-release-pr

- Status: active
- Since: unreleased
- Source: stream HAL-17488 (user-only action steppers); architecture note on HAL-17491, sections 1.2, 5 (row 8), 6.2 and 7.8; task HAL-17551

When a request names `github.merge-release-pr@1` with a GitHub `owner`, `repo`, a `pull_number`, the full head commit `sha` its release card approved and the `release_card`, the action-catalog package shall offer:

- a `check` step that reads `GET /repos/{owner}/{repo}/pulls/{pull_number}`, keeps only `state`, `merged`, `head.ref` and `base.ref`, and requires `state` to be `open`;
- a `check` step that reads `GET /repos/{owner}/{repo}/commits/pull/{pull_number}/head`, keeps only `sha`, requires the request's `expect` to name `sha`, and requires the kept `sha` to equal the `sha` parameter;
- a `call` step of risk `irreversible` that sends `PUT /repos/{owner}/{repo}/pulls/{pull_number}/merge` with that `sha` and `merge_method: squash`, so GitHub refuses the merge if the head moved after the check.

The stepper shall refuse the merge when the pull request's head differs from the request's `expect` ("This changed since the request: …"), when the head differs from the `sha` the merge sends ("The pull request's head commit isn't the one this request merges."), when the pull request isn't open ("This pull request is no longer open, so there is nothing to merge."), or when the request's `expect` has no `sha`. The preview shall name the repository, the pull request, its head and base branches as GitHub answered them, the short head commit and the release card. The manual guide shall be a numbered list holding `https://github.com/{owner}/{repo}/pull/{pull_number}`.

## Examples

- Given the recorded open pull request 12 of `acme/app`, from `release/1.4.0` into `main`, with head `4f2c9e1…`, and release card `ACME-12`,
  when both checks run and the merge is sent,
  then the preview reads "Pull request #12 of acme/app: `release/1.4.0` into `main`." and "Its head commit is `4f2c9e1`, the commit release card `ACME-12` approved.", and the merge sends `sha: 4f2c9e1…`.
- Given a recorded pull request whose head is no longer the one in `expect`,
  when the gate is asked about the merge,
  then it stops at the second check with `This changed since the request: "sha".`
- Given a recorded pull request that is closed,
  when the gate is asked about the merge,
  then it stops at the first check with "This pull request is no longer open, so there is nothing to merge."
- Given a head that moves after the checks,
  when the merge is sent,
  then GitHub answers 409 and the stepper shows its message.
