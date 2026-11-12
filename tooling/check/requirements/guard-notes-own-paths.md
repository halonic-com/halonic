# check.guard-notes-own-paths

- Status: active
- Since: 0.1.0
- Source: HAL-1337

If a pull request changes, adds or deletes a file under one of the guard's own paths, that is a path of `check.guard-own-paths` or `tooling/check/approvers.json`, then the note check shall fail it unless its decision note is `user-visible` (or, for a change under `.github/`, `tooling/check/` or `.gitattributes` that touches none of `tooling/check/approvers.json`, `.github/workflows/guard-notes.yml`, `tooling/check/src/guard/`, `tooling/check/src/cli/guard-notes.ts`, `tooling/check/src/cli/requirement-guard.ts` and the `tooling/check/src/lib/` files they import, `internal`), lists that path as written here under Covers, and its approval is verified, by a signature or, in a `user-visible` note with none, the pinned user's GitHub review (`check.guard-user-review`). A change to `tooling/check/policy.json` in its `extraExports` entry only follows `check.guard-extra-exports` instead.

## Examples

- Given a pull request that changes `.github/workflows/ci.yml` and adds no note,
  when the note check runs,
  then it fails and names the note to add.
- Given the same change with a `user-visible` note listing `.github/`, and the user's approving review of the head commit on GitHub,
  when the note check runs,
  then it passes.
- Given the same change with an `internal` note signed by the CTO,
  when the note check runs,
  then it passes.
- Given an `internal` note signed by the CTO for a change to `tooling/check/src/guard/`, `.github/workflows/guard-notes.yml`, `tooling/check/approvers.json`, `tooling/check/src/lib/problems.ts` or `turbo.json`,
  when the note check runs,
  then it fails, because the Kind must be user-visible.
