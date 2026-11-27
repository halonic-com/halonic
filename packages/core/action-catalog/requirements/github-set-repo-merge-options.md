# action-catalog.github-set-repo-merge-options

- Status: active
- Since: unreleased
- Source: stream HAL-17488 (user-only action steppers); architecture note on HAL-17491, sections 1.2, 5 (row 1) and 7.8; task HAL-17552; plan approved on HAL-20236

When a request names `github.set-repo-merge-options@1` with a GitHub `owner`, `repo` and `on` or `off` for each of `allow_merge_commit`, `allow_squash_merge`, `allow_rebase_merge` and `allow_auto_merge`, the action-catalog package shall give the definition the risk `admin`, offer a `check` step that reads `GET /repos/{owner}/{repo}` and keeps only those four settings, then a `guided` step on `https://github.com/{owner}/{repo}/settings` that names each setting and its new value, preview today's settings next to the new ones when the check has read them, and give a manual guide that is a numbered list holding `https://github.com/{owner}/{repo}/settings`.

## Examples

- Given the recorded read of `acme/app` with merge commits and squash merging on,
  when the check runs through the fake sender and the preview is built,
  then the preview reads "Today: merge commits on, squash merging on, rebase merging off, auto-merge off. After: …".
- Given an `allow_auto_merge` of `true` or a boolean,
  when the parameters are parsed,
  then they are refused.
