# Decision: the app's own page may call the `action_*` commands

- Task: HAL-18084
- Approval: https://paperclip.halonic.com/HAL/issues/HAL-18084 (security PR: Julian reviews security, Liam signs)
- Kind: internal
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:fh+n+6awClwZGgF2n9QDvO6rw2DJmsZevVqLmw1uuWTzlLSm8Oo6RnpI4y23nsT0PsH/b8C6mpC946VHpYsAAg==

## What changes

The requirement `studio.src-tauri.served-page` lists every command the app's own page may call. It
gains the seven commands of user-only action steppers on desktop: `action_send`, `action_sign_in`,
`action_sign_in_cancel`, `action_sign_out`, `action_account`, `action_open_guided` and
`action_open_page`, and the task in its sources. Nothing else in it changes: the Studio the computer
serves still gets no native access, and `served_page_is_refused_every_app_and_plugin_command` now
also covers the seven commands, since it reads them from the build's ACL manifests.

Its tests file moved its four capability-file checks into `served_page_tests/capabilities.rs`,
unchanged apart from the path of their `include_str!`, to keep it under the 480-line headroom. No
test was weakened or skipped.

## Why

The board decided on 24 Nov (HAL-17488, on HAL-10) that only the user runs these actions, in Studio
desktop, with their own sign-in. The approved architecture note (HAL-17491, 2.4) puts the calls in
the shell, so the token stays in the OS keychain and the page can only name a reviewed step. The
capability `desktop-actions.json` grants the commands to the app's own windows only, as every other
desktop capability does.

## Covers

- studio.src-tauri.served-page
- apps/studio/src-tauri/src/served_page_tests.rs
