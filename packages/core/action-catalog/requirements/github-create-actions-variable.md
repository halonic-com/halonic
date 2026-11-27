# action-catalog.github-create-actions-variable

- Status: active
- Since: unreleased
- Source: stream HAL-17488 (user-only action steppers); architecture note on HAL-17491, sections 1.2, 5 (row 2) and 7.8; task HAL-17520; plan approved on HAL-17520

When a request names `github.create-actions-variable@1` with a GitHub `owner`, `repo`, an Actions variable `name` and a one-line printable `value` of at most 1,000 characters, the action-catalog package shall offer one `call` step of risk `admin` that sends `POST /repos/{owner}/{repo}/actions/variables` with `name` and `value` as its body fields, each checked by its parameter's pattern, say in the preview and the manual guide that if the name is already in use the user should use `github.set-actions-variable`, and give a manual guide that is a numbered list holding `https://github.com/{owner}/{repo}/settings/variables/actions/new`.

## Examples

- Given the recorded create of `RELEASE_CHANNEL` in `acme/app`,
  when the step runs through the fake sender,
  then it sends `name` and `value` and GitHub answers 201.
- Given a recorded 409,
  when the step runs,
  then GitHub's "already exists" message comes back, and the preview names "Change an Actions variable".
- Given an empty `name`, one with a space, or a `value` of 1,001 characters,
  when the parameters are parsed,
  then they are refused.
