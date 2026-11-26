# Decision: a phone with only a PIN can answer Inbox items

- Approval: Paperclip task HAL-19060 (split from Liam's review of #6315 on HAL-19028); Liam reviews the PR and signs this note
- Kind: user-visible
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:sF/KwTTxftRDsUCg5lYgq+ZjGekjMZbHXbUBBq4ePlN9O2Wcy+vx7XRjKiPK88xme8CUhyc6pFC9y2TAv5fJBA==
- Task: HAL-19060

## What changes

Since #6315 the shell takes the phone's PIN, pattern or password for an Inbox answer (`msg-answer`), but `owner_check_available` still answered for a strong biometric only. So a phone with a PIN and no strong biometric kept the Inbox's answers off and asked for a screen lock it already had.

- `studio.src-tauri.owner-check-available-command`: the command answers two plain booleans instead of one: `approval` (a strong biometric, as before) and `answer` (a strong biometric or the phone's PIN, pattern or password). Both still fail closed, and it still says nothing about which biometric is enrolled. The examples now name both answers, and one example is added for a phone with only a PIN. No example was removed or weakened.
- `studio.src-tauri.crates.phone-tunnel.phone-answer-confirm`: one example is added, for a phone with a PIN and no strong biometric. The sentence doesn't change.
- The page keeps one hint for approvals (`RemoteView.ownerCheck`) and one for Inbox answers (`RemoteView.answerCheck`). The tests that faked the shell's old boolean now fake the two answers; every case they checked is still checked, and an older shell's plain `true` now reads as no for both.

## Why

What the page shows should match what the shell accepts. Approvals still take a strong biometric only, so nothing a phone may do changes: the shell asks the owner check before it sends every answer, as before.

## Covers

- studio.src-tauri.owner-check-available-command
- studio.src-tauri.crates.phone-tunnel.phone-answer-confirm
- apps/studio/src/connect/tauri-owner-check.test.ts
- packages/studio/features/remote/src/phone/gateway-client-owner-check.test.ts
- packages/studio/features/remote/src/phone/inbox/phone-inbox.test.tsx
