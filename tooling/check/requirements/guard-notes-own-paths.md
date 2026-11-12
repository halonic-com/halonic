# check.guard-notes-own-paths

- Status: active
- Since: 0.1.0
- Source: HAL-1337

If a pull request changes, adds or deletes a file under one of the guard's own paths, that is a path of `check.guard-own-paths` or `tooling/check/approvers.json`, then the note check shall fail it unless its decision note is `user-visible` (or, for a change under `.github/`, `tooling/check/` or `.gitattributes` that reaches none of the trust roots of `check.guard-two-guardians`, `internal`), lists that path as written here under Covers, and its signature verifies, with two guardians' signatures for a trust root. A change to `tooling/check/policy.json` in its `extraExports` entry only follows `check.guard-extra-exports` instead.

## Examples

- Given a pull request that changes `.github/workflows/ci.yml` and adds no note,
  when the note check runs,
  then it fails and names the note to add.
- Given the same change with a `user-visible` note listing `.github/`, signed by the CTO,
  when the note check runs,
  then it passes.
- Given the same change with an `internal` note signed by the CTO,
  when the note check runs,
  then it passes.
- Given an `internal` note signed by the CTO for a change to `tooling/check/src/guard/`, `.github/workflows/guard-notes.yml`, `tooling/check/approvers.json`, `.gitattributes`, `tooling/check/src/lib/problems.ts` or `turbo.json`,
  when the note check runs,
  then it fails, because the Kind must be user-visible.
