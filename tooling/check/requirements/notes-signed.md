# check.notes-signed

- Status: active
- Since: unreleased
- Source: HAL-11244

If a decision note under `decisions/` has no signature line, a signature line in the wrong form, a signature from a key that `tooling/check/approvers.json` doesn't pin, or a header the note format doesn't accept, then the `notes-signed` check shall fail and name the note, unless the note is listed under "Notes without a signature" in `decisions/liam/HAL-11244-note-record.md` or is the note of the pull request's own branch. The note check verifies a signature against its pull request when it merges; this check keeps a note on `main` from going without one.

## Examples

- Given a note with no `- Signature:` line,
  when the check runs on `main`,
  then it fails and names the note.
- Given a note signed by a key that `approvers.json` doesn't pin,
  when the check runs,
  then it fails and names the key.
- Given a signed note whose `Kind` is neither `user-visible` nor `internal`,
  when the check runs,
  then it fails.
- Given a note with a well-formed signature from a pinned key,
  when the check runs,
  then it passes.
- Given an unsigned note that the record lists,
  when the check runs,
  then it passes.
- Given the unsigned note of the pull request's own branch,
  when the check runs on that pull request,
  then it passes, and the note check decides.
