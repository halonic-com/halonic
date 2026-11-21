# Decision: Trusted sources tries a failed plugin sign-out again, and says so

- Approval: HAL-15116, from Iris's flow check C544 (HAL-15101) of halonic#4406; Liam approves this note in his security review
- Kind: user-visible
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:rB6d5eObNCuBH/2/Q3b3pg3qzV1i4WE4ETZ59DwsIphuwx2n/EPy6xsfUReFWl/+zv4g86bmumW87P5W0/1jBw==
- Task: HAL-15116

## What changes

Settings › Trusted sources › **Remove trust** on a plugin row signed the plugin out and then removed the record, also when the sign-out failed. The dialog then said "Couldn't remove trust from linear: …" and kept the row, but the record was already gone, so a second **Remove trust** found no record, tried no sign-out and "worked". The plugin's sign-ins stayed and nothing said so (C544-1).

- **The record is still removed when the sign-out fails**, so the plugin's tools stop either way, as `app.plugin-sign-out` asks. `trustedSourcesOf` now keeps the removed record of a plugin whose sign-out failed, while Studio runs. Removing that location again signs the plugin out again although the record is gone, and a sign-out that works forgets it.
- **The row stays and says so.** `list` gives such a plugin's row with `signOutPending`, and the row says "Trust removed, not signed out" in place of its date. `remove` rejects with the new `SignOutFailedError` (from `@halonicjs/studio-feature-workspace/api`), whose `cause` is the sign-out's error. The dialog then says "Removed trust from linear, but couldn't sign it out: *reason*. Remove trust again to try the sign-out again." Any other failure keeps "Couldn't remove trust from …".
- **A plugin's removal says it was signed out:** "Removed trust from linear and signed it out".
- **Rows differ:** each row says "Plugin" or "Workspace" beside its name, and each row's **Remove** is named "Remove trust from *name*" for screen readers. The old `aria-label` never reached the button: the kit's `Button` doesn't pass one on, so every button was named "Remove".
- The agent host's README no longer says every sign-in route answers `404 unknown_integration`: since halonic#4403 a trusted plugin's backend signs in.

Wording: the new lines build on the approved Trusted sources screen and the C544 report, so the team decides them (HAL-2282).

## Not covered

The wait lasts only while Studio runs. After a restart a plugin whose sign-out failed has no row, and its grants stay in `<profile>/integration-sign-ins/tokens` until the plugin is added again (which signs out leftovers, HAL-14993) or removed with `halonic plugin remove`. Those grants can't be used meanwhile: a sign-in needs the plugin's trust, which is gone. Keeping the wait in the profile would need a change to the trust store's port, which this doesn't make.

## Covers

- app.plugin-sign-out
- workspace.trusted-sources
