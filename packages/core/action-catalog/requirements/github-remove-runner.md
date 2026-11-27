# action-catalog.github-remove-runner

- Status: active
- Since: unreleased
- Source: stream HAL-17488 (user-only action steppers); architecture note on HAL-17491, sections 1.2, 5 (row 1) and 7.8; task HAL-17552; plan approved on HAL-20236

When a request names `github.remove-runner@1` with a GitHub `owner`, `repo` and a positive whole `runner_id`, the action-catalog package shall offer a `check` step that reads `GET /repos/{owner}/{repo}/actions/runners/{runner_id}`, keeps the runner's `name`, `status` and `busy`, and requires `status` to be `offline` with the reason "The runner is still online. Stop it on its machine first, then try again.", then a `call` step of risk `admin` that sends `DELETE` to the same path with no body, and give a manual guide that is a numbered list holding `https://github.com/{owner}/{repo}/settings/actions/runners`.

## Examples

- Given the recorded read of an offline runner 23 in `acme/app`,
  when the check runs through the fake sender and the gate is asked about the removal,
  then the gate lets it through and the `DELETE` is answered 204.
- Given the recorded read of an online runner,
  when the gate is asked about the removal,
  then it refuses with the reason above and nothing is deleted.
- Given a recorded 404 for the runner,
  when the check runs,
  then GitHub's "Not Found" comes back, nothing is kept, and the gate refuses because the check didn't read `status`.
- Given a `runner_id` of 0 or a text,
  when the parameters are parsed,
  then they are refused.
