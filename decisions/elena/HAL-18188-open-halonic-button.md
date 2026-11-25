# Decision: an "Open Halonic" button in a focused app's window with no workspace

- Approval: HAL-18188, the team decision on HAL-18174's row ASK (option B, decided by the team under HAL-2282), and Liam's security review of this pull request
- Kind: user-visible

Halonic Inbox and Halonic Messenger, opened with no workspace, said only
"Open Halonic to choose a workspace." with nothing to press. The line stays
as it is and gets one button, "Open Halonic", that brings Studio's window
forward through the new shell command `show_main_window`.

Requirements edited, none weakened:

- `shell.focused-apps` adds the "Open Halonic" button, which asks the host
  to bring Studio's window forward, to the window with no workspace, and to
  that example. The line it says, and every other promise and example, are
  unchanged.
- `studio.focused-app-window` adds that the button calls the shell's
  `show_main_window`, and the same to the example for nothing in Recent.
  Everything it promised before stays.

No test or golden file is weakened, skipped or deleted; the tests below gain
cases for the button.

## Covers

- shell.focused-apps
- studio.focused-app-window
- packages/studio/shell/src/window/focused-window.test.tsx
- apps/studio/src/studio/start-studio.focused-app.test.ts
