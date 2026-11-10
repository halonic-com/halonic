# app.review-on-open

- Status: active
- Since: 0.1.0
- Source: AI changes 1.9 and 1.10 (HAL-3228); Liam's engine answer, point 1, "when the record and the file disagree on opening" (HAL-3267); HAL-3277

When a workspace opens, or the watcher reports files changed outside Halonic, the review service shall compare each of those files that has a record with the digest the record last saw. If they differ, including a file that is gone, it shall hold the file for Compare and leave the file and its record alone. If a record can't be read, it shall remove it, so that file's changes become ordinary changes.

## Examples

- Given `clerk.agent.yaml` has a record and another editor changed it while Halonic was closed,
  when the workspace opens,
  then the file is held for Compare and still has changes to review.
- Given a record with broken JSON,
  when the workspace opens,
  then the record is removed, reported as dropped, and the file keeps its text.
- Given the watcher reports `notes.agent.yaml`, a file without a record and a path inside `.halonic/`,
  when they are checked,
  then only `notes.agent.yaml` is compared.
