# ports.vcs-commit-ref

- Status: active
- Since: 0.1.0
- Source: HAL-3245; routing note task 1 (HAL-3236); `Vcs` port v2

Where a `Vcs` method takes a version, the version shall be a full commit id (40 or 64 lowercase hex characters); `checkCommitId` shall refuse anything else, such as a branch name, `HEAD`, `@{-1}`, a short id or a name starting with `-`, with a `RangeError` before the repository is touched.

## Examples

- Given `"HEAD"`, `"main"`, `"@{-1}"`, `"--output=x"` or the first 12 characters of a commit id,
  when it is checked,
  then it is refused with a `RangeError`.
- Given a 40-character lowercase hex id, when it is checked, then it passes.
