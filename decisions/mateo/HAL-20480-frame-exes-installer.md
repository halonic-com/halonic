# Decision: the Start menu's Halonic Inbox and Halonic Messenger start their own frame exes

- Approval: https://paperclip.halonic.com/HAL/issues/HAL-20468 (the board's fast-track request; this task is HAL-20480)
- Kind: user-visible

The installer now makes the frames of PR #6799 next to `Halonic.exe` as `Halonic Inbox.exe` and
`Halonic Messenger.exe`: hard links to `Halonic.exe`, which runs only the app's frame when started
under such a name, made again on every install and update, with a copy where a link fails. It
ships no extra exe and signs nothing extra. The Start menu's Halonic Inbox and Halonic Messenger
start them with no arguments instead of `Halonic.exe --app inbox|messenger`. The frames own the apps' top-level
windows, so window managers such as FancyZones and Snap keep each app's place apart from
Studio's. The installer waits for a frame still closing before it replaces or removes its exe,
the uninstaller removes the frames and their saved places, and it still removes a shortcut made
before the frames. A downgrade to a version from before the frames leaves the frame exes behind
in the install folder; that version's shortcuts don't start them, and its uninstaller doesn't
remove them.

`studio.installer-focused-apps` changes its wording to say so; its template test checks the new
target, and gains checks for the hard links, the wait and the uninstall. `studio.app-icons`'s template test
checks the same icon on the shortcut's new target. No test was weakened or skipped. `studio-click-test.paperclip-steps` gains the frame checks of step 13 (one top-level
window of the frame's exe, none new of `Halonic.exe`, no second frame on a second start). Its
Inbox window now passes on Needs you holding the seeded card as well as empty, so a failed step 9
no longer stops the frame checks; step 9 still checks the answer itself.

`.github/workflows/ci.yml` and `tooling/check/src/test/ci-pr-areas.test.ts` add the frames'
crate and `src/app_frames.rs` to the installer area, so a change to the frames runs the
installer and update jobs.

## Why

The board asked for the Inbox and the Messenger to be told apart by window managers (HAL-20468).
They key on the exe that owns a window, so the shortcuts must start the frames.

## Covers

- studio.installer-focused-apps
- studio.app-icons
- studio-click-test.paperclip-steps
- .github/
- tooling/check/
