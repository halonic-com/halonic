# app.review-record

- Status: active
- Since: 0.1.0
- Source: AI changes 1.1 and 1.9 (HAL-3228); Liam's engine answer, point 1 (HAL-3267); Liam's plan review on HAL-3286 (change 6, record names); HAL-3277; where they are kept: HAL-3417

The review service shall keep one record per file with changes to review, as JSON in a store of their own, rooted at the workspace's review folder in the profile and never in the workspace, named by the SHA-256 of the file's path: the path, the file's baseline (or none for a new file), the chat and card that last wrote it, the file's digest as last seen, and, for a deleted file, its entry in the trash. A record that isn't valid JSON, has a field missing or wrong, or sits under another file's name shall count as unreadable, and listing the records shall remove it, so that file's changes become ordinary changes.

## Examples

- Given the assistant changed `agents/clerk.agent.yaml`,
  when its record is saved and read again,
  then it is at the root of the records' store under the SHA-256 of that path and reading gives the same record back.
- Given a file `a` and a file `a.json/b`,
  when both get a record,
  then both records are kept and listed.
- Given a record with broken JSON, and one that says it is about `agents/clerk.agent.yaml` under another name,
  when the records are listed,
  then both are removed and reported as dropped, the other records are listed, and a file not named like a record is left alone.
- Given a path inside `.halonic/`,
  when a record is saved for it,
  then it is refused.
