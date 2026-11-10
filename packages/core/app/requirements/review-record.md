# app.review-record

- Status: active
- Since: 0.1.0
- Source: AI changes 1.1 and 1.9 (HAL-3228); Liam's engine answer, point 1 (HAL-3267); HAL-3277

The review service shall keep one record per file with changes to review, as JSON at `.halonic/review/files/<path>.json` in the workspace: the file's path, its baseline (or none for a new file), the chat and card that last wrote it, the file's digest as last seen, and, for a deleted file, its entry in the trash. A record that isn't valid JSON, has a field missing or wrong, or names another path than its place shall count as unreadable, and listing the records shall remove it, so that file's changes become ordinary changes.

## Examples

- Given the assistant changed `agents/clerk.agent.yaml`,
  when its record is saved and read again,
  then `.halonic/review/files/agents/clerk.agent.yaml.json` holds it and reading gives the same record back.
- Given `.halonic/review/files/agents/clerk.agent.yaml.json` holds `{"format":1,`,
  when the records are listed,
  then it is removed and reported as dropped, and the other records are listed.
- Given a record that says it is about `agents/other.agent.yaml` but sits at `agents/clerk.agent.yaml.json`,
  when it is read,
  then it counts as unreadable.
- Given a path inside `.halonic/`,
  when a record is saved for it,
  then it is refused.
