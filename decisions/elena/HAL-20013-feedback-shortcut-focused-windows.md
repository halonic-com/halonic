# Decision: the feedback shortcut works in Halonic Inbox and Halonic Messenger

- Task: HAL-20013
- Approval: the board's report on HAL-10, routed to the apps owner on HAL-20013 (https://paperclip.halonic.com/HAL/issues/HAL-20013): the shortcut must open Send feedback in Messenger, and in Inbox, as it does in Studio.
- Kind: user-visible
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:uUzdz/btEDbrC/9j8hEOO/1J51elfhdZts8Rxg6GzjdSy1Hb+N8tpsAG7jL3spFyTPoslJYvI/a2NhmZOAw+Cg==

## What changes

The requirement `studio.feedback-window` said the desktop app starts the feedback shortcut only in
Studio's main window, and not in Halonic Inbox or Halonic Messenger, because they had no folder to
send from (Liam's condition 1 on HAL-19671). Both windows do open a folder: the one they showed
before, or the one Studio last had open (`studio.window-content`). The requirement now says the
shortcut starts in all three windows, and that Inbox and Messenger send through the folder they
opened, into the outbox every window already shares (`feedback.outbox-windows`). A window that
opened no folder still starts no shortcut. The shell already lets all three windows capture
(`desktop-feedback-capture.json`), so no Rust or capability changes.

The test "starts no feedback shortcut in the inbox / messenger window" now says "while it opened no
folder", which is what it always set up (no Recent folder). Its assertions are unchanged. New
tests check that Ctrl+Shift+F asks the shell for a capture in a window that opened Acme: once
through the window's feedback starter, and once in each of the Inbox and Messenger windows as
`startFocusedApp` starts them, with the folder opener given by the test. No test was weakened or
skipped. The requirement is unreleased.

## Why

The board pressed the shortcut in Messenger and nothing happened. The reason for the old rule (no
folder to send from) no longer holds.

## Covers

- studio.feedback-window
- apps/studio/src/studio/start-studio.feedback.test.ts
