# check.guard-two-guardians

- Status: active
- Since: 0.1.0
- Source: HAL-1337

If a pull request changes, adds or deletes a trust root of the guard, that is `tooling/check/approvers.json`, `.gitattributes`, `tooling/check/policy.json` outside `extraExports`, `.github/workflows/guard-notes.yml`, `tooling/check/src/guard/`, the two guard commands or the `lib/` helpers they import, then the note check shall fail it unless its decision note carries `- Signature:` lines from two different keys that the base branch's `tooling/check/approvers.json` lists as `guardians`, or from every guardian if the base lists fewer than two.

## Examples

- Given a change to `tooling/check/src/guard/approvals.ts` and a `user-visible` note signed by two different guardians,
  when the note check runs,
  then it passes.
- Given the same note with one signature, or the same key twice,
  when the note check runs,
  then it fails.
- Given a pull request that adds its own key to `guardians` or removes one, and a note signed under that list,
  when the note check runs,
  then it fails, because the list is read from the base branch.
- Given the signatures replayed on another pull request, or a note edited after the first signature,
  when the note check runs,
  then it fails.
- Given a base branch that lists one guardian, and that guardian's signature,
  when the note check runs,
  then it passes, which is how the second guardian is added.
