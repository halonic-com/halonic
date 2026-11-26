# Decision: the "Updated to" toast becomes a dialog that shows what's new

- Requirement: `settings.restart-flow` (`packages/studio/features/settings/requirements/restart-flow.md`)
- Task: HAL-19364 (the board's request on HAL-10, 26 Nov: "when it restarts it should show a modal that it was updated and whats new"); plan approved on HAL-19365
- Approval: https://paperclip.halonic.com/HAL/issues/HAL-19365 (Liam asked for this note for the toast change)
- Kind: user-visible
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:yQfWa8XvYUSEd1qxGp8MqpiE6pEVwn2f8rtUKCoAaI0aqRS4nz5DZ9Kg00AmAFXQVTIO8vLKCKrMzHeH0ZZYDA==

At the first start after an update, Studio showed an info toast "Updated to Halonic 0.1.1" with
**What's new**, which opened the release page. The board asked for a dialog instead, one that says
it was updated and what's new. `settings.restart-flow` now says the "Updated to Halonic 0.1.1"
dialog shows (new requirement `settings.whats-new`) and that no toast says it. The test "shows the
Updated to toast once, with What's new" becomes "shows the Updated to dialog once, with what's new,
in place of a toast", which also checks that a reload doesn't show it again. Nothing else in
`settings.restart-flow` changes: the error toast for an update that didn't install, the toast for
settings that couldn't be carried over, and the restart dialog stay as they are, and no other test
was changed or removed.

## Covers

- settings.restart-flow
- packages/studio/features/settings/src/updater/restart-flow.test.tsx
