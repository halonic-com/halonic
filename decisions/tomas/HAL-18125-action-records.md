# Decision: the app's own page may call the `action_record_*` commands

- Task: HAL-18125
- Approval: https://paperclip.halonic.com/HAL/issues/HAL-18125 (security PR: Julian reviews security, Liam signs)
- Kind: internal
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:1ujaztjFfx6LiPzb3VJbejod8oIfeq1Ob63HODRiRT9SSFyAPsP82y3xLnEJHSpTYjWP3cQz8l5kS6SrkwqsAQ==

## What changes

The requirement `studio.src-tauri.served-page` lists every command the app's own page may call. It
gains the two record commands of user-only action steppers on desktop: `action_record_append` and
`action_record_read`, and the task in its sources. Nothing else in it changes: the Studio the
computer serves still gets no native access, and `served_page_is_refused_every_app_and_plugin_command`
now also covers the two commands, since it reads them from the build's ACL manifests. The
capability check in `served_page_tests/capabilities.rs` lists the two new permissions of
`desktop-actions.json`. A new golden, `record-events.json` in `action-send-tauri`, holds the record
events both the adapter's tests and the shell's `tests/records.rs` read, so the two allow-lists
can't drift apart. No test was weakened or skipped.

## Why

The approved architecture note (HAL-17491, 4.2) keeps each request's record outside every
workspace, in the app data folder, one file per request that only the user can read, written
through the shell. The commands take a request id or an event, never a path; the shell writes only
events the action events' allow-list takes and names each file by the SHA-256 of the request id.
The capability `desktop-actions.json` grants them to the app's own windows only, like the other
`action_*` commands.

## Covers

- studio.src-tauri.served-page
- apps/studio/src-tauri/src/served_page_tests/capabilities.rs
- packages/adapters/action-send-tauri/src/golden/record-events.json
