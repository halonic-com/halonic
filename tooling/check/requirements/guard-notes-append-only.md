# check.guard-notes-append-only

- Status: active
- Since: unreleased
- Source: HAL-9693

If a pull request edits or deletes a file under `decisions/` that the base branch already has, other than the pull request's own note, then the note check shall fail it unless its decision note is `user-visible`, lists that file's path under Covers, and its signature verifies. Notes on the base branch are the record of what was approved, so they are append-only.

## Examples

- Given a pull request that edits the Covers of a note already on the base branch and adds no note,
  when the note check runs,
  then it fails and names the note it edits.
- Given a pull request that deletes a note already on the base branch,
  when the note check runs,
  then it fails.
- Given the same change with a `user-visible` note that lists the edited note's path and carries the CTO's signature,
  when the note check runs,
  then it passes.
- Given the same change with a note that doesn't list the path, or an `internal` one,
  when the note check runs,
  then it fails.
- Given a pull request that only adds its own note,
  when the note check runs,
  then the rule doesn't apply.
