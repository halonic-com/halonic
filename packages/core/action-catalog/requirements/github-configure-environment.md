# action-catalog.github-configure-environment

- Status: active
- Since: unreleased
- Source: stream HAL-17488 (user-only action steppers); architecture note on HAL-17491, sections 1.2, 5 (row 10) and 7.8; task HAL-17522; plan approved on HAL-17522 (guided step; the `PUT` is HAL-20272)

When a request names `github.configure-environment@1` with a GitHub `owner`, `repo`, an `environment` name, a `reviewer` login, a `wait_timer` from 0 to 43,200 minutes and `branches` of "No restriction" or "Protected branches only", the action-catalog package shall offer a `check` step that reads `GET /repos/{owner}/{repo}/environments/{environment}` and keeps only `name`, `can_admins_bypass`, `deployment_branch_policy.protected_branches` and `deployment_branch_policy.custom_branch_policies`; then a `guided` step of risk `admin` that opens `https://github.com/{owner}/{repo}/settings/environments` with numbered instructions for setting the reviewer, wait timer and branches there, with the user's own GitHub sign-in; then a `check` step that reads the same path, keeps the same fields and `updated_at`, and names `updated_at` as its `changedAfterStart` field. The definition shall have no `call` step that changes the environment. The preview shall set today's branch policy next to the requested settings once the first check has read it, and the manual guide shall be a numbered list holding the environments page address.

## Examples

- Given the recorded environment `production` of `acme/app` with no branch policy,
  when the first check runs,
  then the preview reads "Today, `production` of acme/app deploys from any branch."
- Given a recorded environment saved after the stepper opened,
  when the last check runs,
  then it keeps `deployment_branch_policy.protected_branches: true` and the check passes.
- Given a recorded environment last saved before the stepper opened,
  when the last check runs,
  then the check fails.
