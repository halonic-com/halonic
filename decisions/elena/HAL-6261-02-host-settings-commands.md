# Decision: the profile golden cases give the settings folder too

- Requirement: `profile.settings-folder` (`packages/core/profile/requirements/settings-folder.md`)
- Task: HAL-6261 (PR 7d of the settings host API, design on HAL-6159)
- Approval: Liam approved this part in his review on [HAL-6545](/HAL/issues/HAL-6545) and approves this note in review
- Kind: internal
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:T/WANY+AFyX7WNoXicKiBeJC/8nuDze+qq0WRGkWMCUDoSPyPc0nfEnkF6OxVsTDw2eOd9vOXQxWzfQ02wKdAA==

The desktop shell finds the host settings folder in Rust, with `settings_folder()` in the
`halonic-profile` crate. So that the shell and the CLI save to the same `settings/host.json`,
both sides are now tested against one list instead of two copies of the rule:

- `packages/core/profile/src/golden/profile-folders.json`: every case gains a `settings` field,
  the settings folder it must give (or `null` where no profile folder is found). No existing
  field, case or answer changed.
- `profile.settings-folder`: one sentence added, saying the golden cases give the settings
  folder and the Rust port gives the same answers. The rule itself (`settings` in the profile
  folder, creating nothing) is unchanged.

`settings-folder.test.ts` reads the new field for every case; the crate's `tests/golden.rs`
reads the same file. No test was removed.

## Covers

- profile.settings-folder
- packages/core/profile/src/golden/profile-folders.json
