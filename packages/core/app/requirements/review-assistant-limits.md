# app.review-assistant-limits

- Status: active
- Since: 0.1.0
- Source: HAL-65 section F, rules A, B and C (`workspace.trust.assistant-no-git-or-halonic`, `assistant-untrusted-items-only`, `untrusted-changes-held`); Julian's attack test plan on HAL-3353, agreed on HAL-3362; HAL-3277

If the assistant writes or deletes a path inside `.git/` or any `.halonic/` folder, a private or unsafe path, or a path through a link, then the review service shall refuse it as not allowed and touch nothing, whether the workspace is trusted or not, matching folder names as the port matches private names. While the workspace is untrusted, the review service shall refuse, as untrusted, every path that isn't a Halonic item file in the grouped layout, reading the trust state on every call. A record shall carry the untrusted mark when any of its changes was made while untrusted, until the record goes.

## Examples

- Given a trusted or untrusted workspace,
  when the assistant writes `.git/hooks/pre-commit`, `hubs/h/.halonic/x` or `.Halonic./review/x`,
  then it is refused as not allowed and nothing changes.
- Given a workspace that was trusted for the first write to `package.json` and isn't trusted any more,
  when the assistant writes or deletes `package.json` again,
  then it is refused as untrusted and the file keeps the first write.
- Given an untrusted workspace,
  when the assistant changes an agent file and `models.yaml`,
  then both are written and their records carry the untrusted mark, which stays after a later trusted change.
