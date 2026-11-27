# action-catalog.github-set-actions-variable

- Status: active
- Since: unreleased
- Source: stream HAL-17488 (user-only action steppers); architecture note on HAL-17491, sections 1.2, 5 (row 2) and 7.8; task HAL-17520; plan approved on HAL-17520

When a request names `github.set-actions-variable@1` with a GitHub `owner`, `repo`, an Actions variable `name` and a one-line printable `value` of at most 1,000 characters, the action-catalog package shall offer a `check` step that reads `GET /repos/{owner}/{repo}/actions/variables/{name}` and keeps only `name` and `value`, then a `call` step of risk `admin` that sends `PATCH` to the same path with `value` as its only body field, preview the change as today's value next to the new one when the check has read it, say in the preview and the manual guide that a "not found" answer means the variable doesn't exist and to use `github.create-actions-variable`, and give a manual guide that is a numbered list holding `https://github.com/{owner}/{repo}/settings/variables/actions`.

## Examples

- Given the recorded read of `acme/app` `RELEASE_CHANNEL` with the value `beta`,
  when the check runs through the fake sender and the preview is built for `stable`,
  then the preview reads "`RELEASE_CHANNEL` today: `beta`. After: `stable`." and the change sends only `value: stable`.
- Given a recorded 404,
  when the check runs,
  then GitHub's "Not Found" comes back and nothing is kept.
- Given a `name` of `1ST` or `RELEASE-CHANNEL`, or a `value` that is empty or has a line break,
  when the parameters are parsed,
  then they are refused.
