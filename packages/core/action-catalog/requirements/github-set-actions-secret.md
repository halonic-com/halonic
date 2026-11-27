# action-catalog.github-set-actions-secret

- Status: active
- Since: unreleased
- Source: stream HAL-17488 (user-only action steppers); architecture note on HAL-17491, sections 1.2, 5 (row 2) and 7.8; Julian's decision 5 on HAL-17491; task HAL-17520; plan approved on HAL-17520

When a request names `github.set-actions-secret@1` with a GitHub `owner`, `repo` and an Actions secret `name`, the action-catalog package shall offer a `guided` step of risk `admin` that opens `https://github.com/{owner}/{repo}/settings/secrets/actions` with numbered instructions for typing the value there, then a `check` step that reads `GET /repos/{owner}/{repo}/actions/secrets/{name}`, keeps only `name` and `updated_at`, and names `updated_at` as its `changedAfterStart` field, so the check passes only when GitHub saved the secret after the stepper opened. The definition shall have no parameter, `input` step, guided `result` or kept field that can carry the secret's value, and its manual guide shall be a numbered list holding the secrets page address.

## Examples

- Given the stepper opened at `2026-11-27T09:00:00Z` and the recorded read gives an `updated_at` of `2026-11-27T09:03:41Z`,
  when the check is judged,
  then it passes.
- Given a recorded `updated_at` of `2026-11-26T18:30:05Z`, or a recorded 404,
  when the check is judged,
  then it fails.
- Given parameters with an extra `value`, `secret` or `encrypted_value`,
  when they are parsed,
  then they are refused.
