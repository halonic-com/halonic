# action-catalog.github-change-branch-protection

- Status: active
- Since: unreleased
- Source: stream HAL-17488 (user-only action steppers); architecture note on HAL-17491, sections 1.2, 4.3, 5 (row 1) and 7.8; task HAL-17518; plan approved on HAL-20151

When a request names `github.change-branch-protection@1` with a GitHub `owner`, `repo`, one-segment `branch` and a `required_approving_review_count` from 0 to 6, the action-catalog package shall offer a `check` step that reads `GET /repos/{owner}/{repo}/branches/{branch}/protection/required_pull_request_reviews` and keeps only the review count and the three top-level booleans, then a `call` step of risk `admin` that sends `PATCH` to the same path with the review count as its only body field, preview the change as today's count next to the new one when the check has read it, say in the preview and the manual guide that a "not found" answer means no classic rule requires reviews and the branch may be governed by a ruleset, pointing to `github.change-ruleset`, and give a manual guide that is a numbered list holding `https://github.com/{owner}/{repo}/settings/branches`.

## Examples

- Given the recorded read of `acme/app` `main` with 1 required review,
  when the check runs through the fake sender and the preview is built for 2,
  then the preview reads "Required reviews on `main` today: 1. After: 2." and the change sends only `required_approving_review_count: 2`.
- Given a request whose `expect` holds a count of 2 while the check reads 1,
  when the expect is compared,
  then the stepper stops with "This changed since the request" before the change is sent.
- Given recorded answers 401, 403 with a missing permission, 404 and 422,
  when the step runs through the fake sender,
  then GitHub's status and message come back and nothing is kept.
- Given a `branch` of `release/1` or a count of 7,
  when the parameters are parsed,
  then they are refused.
