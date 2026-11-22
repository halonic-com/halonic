# Decision: a run proposal's file changed since the run keeps Reject, and the command accepts

- Task: HAL-16066
- Approval: https://paperclip.halonic.com/HAL/issues/HAL-16066 (a team decision with no board card, HAL-2282 rule: wording on the approved Inbox and proposal page; rows 26 and 37 of the designer's words check C665 on HAL-16044)
- Kind: user-visible

## What changes

- **A file that changed after the run started (C665 26).** An Accept leaves such a file alone. Its
  line said "You changed this file after run 01JD8Q started, so it wasn't accepted." and hid both
  buttons. Until Compare ships, nothing could decide the file, so the proposal never settled and
  Needs you kept counting it; and the host knows only that the file changed, not who changed it
  (the CLI says "changed since the run"). The line now says "This file changed after run 01JD8Q
  started, so it wasn't accepted. To keep it as it is now, reject it.", and the file keeps
  **Reject**, which takes focus in place of its **Accept**. Once every undecided file changed,
  **Accept all** doesn't show, since it could decide none of them. The agent host's Reject
  doesn't check the disk, so it settles such a file.
- **Where the window can't decide (C665 37, microcopy 1.5).** The line becomes "These changes can't
  be accepted here yet. To accept them, run this in a terminal:" with
  `halonic proposals accept 01JD8Q` to copy, in place of `halonic proposals show`. It names only
  the verb the page and the CLI share (C672 #5, HAL-16100): the CLI calls a reject `discard`, and
  the line sends the reader to the CLI.

## Covers

- inbox.proposal-page
