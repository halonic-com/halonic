# Decision: a focused app's frame is slate-75 in light, not slate-50

- Approval: https://paperclip.halonic.com/HAL/issues/HAL-10 (the board asked on 25 Nov, 16:38 UTC for the sidebar a little darker, "slate-75 for instance", including the frame; built on HAL-18691)
- Kind: user-visible

`shell.focused-apps` said a focused app's window sits on the approved frame, slate-50 in light.
The board asked for the sidebar, frame included, a little darker: slate-75, halfway between
slate-50 and slate-100. The Messenger draws its chat list straight on that frame, beside its white
panel, so the one frame token (`--color-app-frame`) now has #f4f7fa in light, and the requirement
says slate-75. Dark stays slate-950. No test was removed and none checks less: the kit's theme
test now pins the token's value, the shell's test checks the window draws on it, and the
contrast tests still hold every text colour on the frame to 4.5:1.

## Covers

- shell.focused-apps
