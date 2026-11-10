# app.review-items-to-review

- Status: active
- Since: 0.1.0
- Source: AI changes 1.2 (the Changes row) and 1.8 (Create version leaves them out) (HAL-3228); Liam's engine answer, points 1 and 3 (`commitVersion` exclude, HAL-3245); HAL-3277

The review service shall list the files with changes to review, sorted by path, each with the card it belongs to, so Create version can leave them out and Changes can mark their rows.

## Examples

- Given the assistant changed `clerk.agent.yaml` in card `k1` and created `notes.agent.yaml` in card `k2`,
  when the list is asked for,
  then it is `clerk.agent.yaml` with `k1` and `notes.agent.yaml` with `k2`.
- Given the person accepts `clerk.agent.yaml`,
  when the list is asked for again,
  then only `notes.agent.yaml` is on it.
