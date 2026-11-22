# check.guard-notes-base

- Status: active
- Since: unreleased
- Source: HAL-16326

When a pull request's base branch changes, the note check in `.github/workflows/guard-notes.yml` shall run again against the new base, and if the base is neither `main` nor a `release/` branch, the note check shall fail.

## Examples

- Given a pull request into `main`,
  when its base is changed to another branch and back to `main`,
  then the note check runs again on the `edited` event, against `main`.
- Given a pull request whose title is edited,
  when the note check runs on that `edited` event,
  then it runs in full, not only when the base changed.
- Given a pull request or merge group into `main` or `release/0.1`,
  when the note check's first step runs,
  then it passes.
- Given a pull request into any other branch,
  when the note check's first step runs,
  then it fails and says to change the base.
