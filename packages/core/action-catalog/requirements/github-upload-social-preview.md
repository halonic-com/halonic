# action-catalog.github-upload-social-preview

- Status: active
- Since: unreleased
- Source: stream HAL-17488 (user-only action steppers); architecture note on HAL-17491, sections 1.2, 5 (row 13), 7.8 and 7.9; task HAL-17561

When a request names `github.upload-social-preview@1` with a GitHub `owner` and `repo`, the action-catalog package shall offer one `guided` step that opens `https://github.com/{owner}/{repo}/settings` with numbered instructions for uploading the social preview image, preview it in one sentence that names the repository and says Halonic can't check it, and give a manual guide that is a numbered list holding that address and ends by saying the step is recorded as done by hand, not checked.

## Examples

- Given the parameters `owner` `acme` and `repo` `app`,
  when the preview is built,
  then it is one sentence naming `acme/app` and saying Halonic can't check it.
- Given the same parameters,
  when the manual guide is built,
  then its first line is `1. Open https://github.com/acme/app/settings`, every following instruction is numbered, and it ends with "done by hand, not checked".
- Given the parameters `owner` `acme` and `repo` `../secrets`,
  when they are parsed,
  then they are refused.
