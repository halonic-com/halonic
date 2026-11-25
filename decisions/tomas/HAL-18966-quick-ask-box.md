# Decision: the shell starts a third focused app, quick ask's box, drawn without a frame

- Task: HAL-18966
- Approval: the board approved quick ask on HAL-18594 (25 Nov); Liam approved the plan on HAL-18625 (https://paperclip.halonic.com/HAL/issues/HAL-18625), with this PR on its own task, HAL-18966; Liam signs this note in review
- Kind: internal
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:4D1CYQBGGDlEGJY21kx7r5BDP2TNZCbjq9N7LCy75m6YF/DYQaY0doigrH1klC8f1Dmc23mWNyfI+92moNfCDw==

## What changes

The requirement `shell.focused-apps` named the two focused apps a feature may add, `inbox` and
`messenger`. It now names a third, `ask`: quick ask's box, which the desktop shell shows in its own
window (`studio.src-tauri.quick-ask-window`, PR #6271). The box floats over other apps on a
see-through window, so a focused app can now say it is `floating`, and then the shell draws its
view straight on the window, with no frame and no panel. Inbox and Messenger keep the approved
frame as before.

The requirement gains one sentence and one example for that; nothing in it is removed or
weakened, and every existing test stays as it is. One test is added: a floating app has no frame
or panel.

## Why

Without `ask` in the list, the shell refuses the Quick Ask feature's focused app, and the box's
window from #6271 would show Studio's page with nothing in it. The frame would paint an opaque
slate background round the 640 px box, which the design (HAL-18594 section 6, Noah's visual pass)
draws on a see-through window with its own border and shadow.

## Covers

- shell.focused-apps
