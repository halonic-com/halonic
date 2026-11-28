# action-catalog.github-approve-deployment

- Status: active
- Since: unreleased
- Source: stream HAL-17488 (user-only action steppers); architecture note on HAL-17491, sections 1.2, 5 (row 8), 6.2 and 7.8; task HAL-17522; plan approved on HAL-17522 (option b); task HAL-21176 (fork runs); task HAL-21205 (the fork in the approval line)

When a request names `github.approve-deployment@1` with a GitHub `owner`, `repo`, a workflow `run_id`, an `environment` name and its `environment_id`, the action-catalog package shall offer:

- a `check` step that reads `GET /repos/{owner}/{repo}/actions/runs/{run_id}`, keeps only `status`, `head_sha`, `head_branch`, `head_repository.full_name` and `triggering_actor.login`, requires the request's `expect` to name `head_sha`, and requires `status` to be `waiting`;
- a `check` step that reads `GET /repos/{owner}/{repo}/environments/{environment}`, keeps only `id` and `name`, and requires the kept `id` to equal `environment_id`;
- a `call` step of risk `irreversible` that sends `POST /repos/{owner}/{repo}/actions/runs/{run_id}/pending_deployments` with `environment_ids` as a one-item list of `environment_id`, `state: approved` and a constant comment.

The stepper shall refuse the approval when the run's head commit differs from the request's `expect`, when the run is no longer waiting ("This run is no longer waiting for approval, so there is nothing to approve."), when the request's `expect` has no `head_sha`, or when GitHub's id for the named environment isn't `environment_id`. The preview shall name the repository, the run, its short head commit, head branch and who started it, and the environment by the name GitHub answered, never by the request's text. When the run's head repository isn't `{owner}/{repo}` (compared without case), as for a run from a fork's pull request, whose branch name the fork chose, the preview shall name that repository as the fork ("on `main` of the fork `outsider/app`"), and when GitHub names no head repository it shall say so ("of a repository GitHub didn't name"); the stepper names such a run rather than refusing it. Once the run check has answered, the approval's own line, which the dialog confirming the irreversible step shows alone, shall name such a head repository too ("Approves run 7001 of acme/app, a commit of the fork `outsider/app`, for the environment …"), and shall name none when it is `{owner}/{repo}`. When GitHub answers no `head_branch`, the preview shall still name the short head commit and its head repository, without a branch. When GitHub's id for the named environment isn't `environment_id`, the preview shall not pair GitHub's name with `environment_id`: it shall say the two differ and name the approved environment by its id only. There is no check on `pending_deployments`, since its answer is a list `keep` can't read; GitHub refuses the approval with a 422 for an environment the run isn't waiting on. The manual guide shall be a numbered list holding `https://github.com/{owner}/{repo}/actions/runs/{run_id}`.

## Examples

- Given the recorded run 7001 of `acme/app`, waiting on commit `4f2c9e1…` on `main`, started by `acme-dev`, and the environment `production` with id 42,
  when both checks run and the approval is sent,
  then the preview reads "Run 7001 of acme/app: commit `4f2c9e1` on `main`, started by `acme-dev`." and "Environment `production` (id 42).", and the approval sends `environment_ids: [42]`.
- Given a recorded run whose head commit is no longer the one in `expect`,
  when the gate is asked about the approval,
  then it stops at the first check with the changed `head_sha`.
- Given a recorded run whose `status` is `completed`,
  when the gate is asked about the approval,
  then it stops with "This run is no longer waiting for approval, so there is nothing to approve."
- Given a request naming `staging` with production's id 42, and GitHub's id for `staging` is 41,
  when the gate is asked about the approval,
  then it stops at the second check, and the preview reads "GitHub's environment `staging` has id 41, not 42, the id this request approves." and names the approved environment only as id 42.
- Given a recorded run 7001 of `acme/app` from a pull request of the fork `outsider/app`, on the fork's branch `main`, started by `outsider`,
  when the first check runs,
  then the preview reads "Run 7001 of acme/app: commit `4f2c9e1` on `main` of the fork `outsider/app`, started by `outsider`."
  and the approval line reads "Approves run 7001 of acme/app, a commit of the fork `outsider/app`, for the environment `production`. This starts the deployment and can't be undone."
- Given the same recorded fork run, but GitHub answers `head_branch: null`,
  when the first check runs,
  then the preview reads "Run 7001 of acme/app: commit `4f2c9e1` of the fork `outsider/app`, started by `outsider`."
- Given a request whose `environment` is `.` or `..`,
  when it is parsed,
  then it is refused.
