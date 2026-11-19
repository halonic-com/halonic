# Decision: the Plugins screens drop dead update buttons and Try again on lines it can't help

- Task: HAL-12370
- Approval: https://paperclip.halonic.com/HAL/issues/HAL-12363 (Sofia's UX check, rows L9 to L12: small wording and fallbacks on the approved plugin screens, a team decision under HAL-2282; same words as microcopy revision 109 on HAL-751)
- Kind: user-visible
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:+b8nr9pPa7i4GPWWT9TByfvqFNCc5VH7mOdZtG0JPAteZDuF+13YEBfPp0jpzBbHs1sPADkwfUjBLHbOsd8vDA==

## What changes

- **L9, plugin page.** While the app can't read a plugin's source again (the desktop app until
  HAL-9373), the page offers neither **Check for updates** nor **Update from folder**, in the status
  box or the ⋮ (rule N5b). `afterColon` no longer lowercases "Halonic" or "Studio" after the colon.
- **L10, Used by and the Remove dialog.** "Halonic couldn't check which connectors use it." becomes
  "Halonic can't tell yet which connectors use it.", without Try again.
- **L11, Home cards and the command dialog.** When the host can't run plugin tools at all, the card
  says "Plugin tools aren't in this build of Halonic yet, so *title* can't show anything." (the
  command dialog: "…so *title* can't run."), or the host's Windows line, on its own, with no
  Try again and, on a card, no ↻. Other tool failures keep "Couldn't get *title*: *reason*." with
  Try again.
- **L12, Plugins list without an installer.** The line becomes "Studio can't add a plugin yet. To
  add one, run this in a terminal:". The command to copy stays.

## Why

A button that always refuses, or a Try again that gives the same answer, is a dead end (UX check
rules N1 to N7). The words are Sofia's. The command dialog's "can't run" instead of "can't show
anything" is a word detail decided on the task and offered back to Sofia.

Side effect: the host's `not_in_this_build` and `not_fenced` refusals now reach the screen as
they are; before, `errorReasonFor` swapped them for its generic fallback.

Only the expectations for the changed words were updated; new tests cover each new case. No test
was weakened or removed.

## Covers

- plugins.plugin-actions
- plugins.plugin-cards
- plugins.plugin-commands
- plugins.plugin-list-no-installer
- plugins.plugin-page
- plugins.plugin-updates
