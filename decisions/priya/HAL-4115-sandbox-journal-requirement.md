# Decision: `profile.profile-folder` names the sandbox journal folder

- Requirements: `profile.profile-folder` (`packages/core/profile/requirements/profile-folder.md`)
- Task: HAL-4115 (found by the README check in HAL-4061)
- Approval: HAL-4115, the CTO's request to add the export to the requirement
- Kind: internal
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:NvkOZKgKAagaTynfYENH65L7ds20xvrlD5Uf6ngcGms0gUcdu3UtE8rGdPkv5lHi8Z2DBlin4Sd0Q/yEUqiKCA==

## What changes

The requirement now also says that the profile package names the folder for the sandbox's crash
journals, `sandbox-journals` in the profile folder, joined with the profile's own separator. It gets
one example and HAL-3588 as a source. The code doesn't change: `sandboxJournalFolder` has done this
since HAL-3588, and the CLI uses it.

## Why

`sandboxJournalFolder` is a public export of the package, and the README describes it, but no
requirement covered it. Its existing test now runs under the requirement's ID, so the trace shows it.

## Tests

No test was weakened. The existing `sandboxJournalFolder` test is unchanged, apart from running under
`verifies("profile.profile-folder")` instead of a plain `describe`.

## Covers

- `profile.profile-folder`
