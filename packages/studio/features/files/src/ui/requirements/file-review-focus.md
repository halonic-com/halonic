# files.ui.file-review-focus

- Status: active
- Since: unreleased
- Source: HAL-18077 (a11y check RV1, HAL-18044); AI changes 1.2, "In a file" (HAL-3228)

When a part's Accept or Reject, or Accept file or Reject file, is done, the file's tab shall read the parts again and, where the focus fell to the page's body, go to the part now at the decided one's place (or the last part) in the editor; with no part left, it shall move the focus to the tab's `h1`, the file's name.

## Examples

- Given two parts and the focus on the first one's Accept,
  when it is accepted,
  then the editor goes to the part that is now first.
- Given Accept file is done,
  when the parts are read again and none are left,
  then the focus is on the `h1`.
