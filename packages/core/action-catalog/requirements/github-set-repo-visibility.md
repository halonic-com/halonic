# action-catalog.github-set-repo-visibility

- Status: active
- Since: unreleased
- Source: stream HAL-17488 (user-only action steppers); architecture note on HAL-17491, sections 1.2, 5 (row 12) and 7.8; task HAL-17552; plan approved on HAL-20236

When a request names `github.set-repo-visibility@1` with a GitHub `owner`, `repo` and a `visibility` of `public` or `private`, the action-catalog package shall give the definition the risk `irreversible`, offer a `check` step that reads `GET /repos/{owner}/{repo}` and keeps only `visibility`, then a `guided` step on `https://github.com/{owner}/{repo}/settings` where GitHub's own dialog asks the user to type the repository name, preview what the change exposes or removes (for `public`: that anyone can then see the code, the whole commit history, issues, pull requests and releases, and that making it private again doesn't take that back), with today's visibility next to the new one when the check has read it, and give a manual guide that is a numbered list holding `https://github.com/{owner}/{repo}/settings`.

## Examples

- Given the recorded read of a private `acme/app`,
  when the check runs through the fake sender and the preview is built for `public`,
  then the preview reads "acme/app is private today. After: public." followed by what becomes public.
- Given the definition,
  when its routes are built,
  then the check runs without the native dialog and the change is a guided step on the settings page.
- Given a `visibility` of `internal`,
  when the parameters are parsed,
  then they are refused.
