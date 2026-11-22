# Decision: a run proposal's file changed since the run keeps Reject; a window that can't decide points to your computer

- Task: HAL-16066
- Approval: https://paperclip.halonic.com/HAL/issues/HAL-16066 (a team decision with no board card, HAL-2282 rule: wording on the approved Inbox and proposal page; row 26 of the designer's words check C665 on HAL-16044, and row 22 of C671 on HAL-16090, task HAL-16104)
- Kind: user-visible
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:JTDl8rKSaWzpIVe3OPuCejH8+ExXesmJy4B0Q8dikn7b3pVKbbfa2J+LkqdRfaSokzysAYduzihPcxXAXEQuDw==

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
- **Where the window can't decide (C671 22, replacing C665 37).** Only a served Studio and the
  phone get this line, so "in a terminal" pointed at the device in the person's hand. It becomes
  "Studio can't accept or reject these changes here. To see them and decide, use the desktop app,
  or run this on your computer:", still with `halonic proposals show 01JD8Q` to copy. C665 37's
  "yet" and `halonic proposals accept` are dropped, and so is C672 #5's "These changes can't be
  accepted here yet." (HAL-16100): the words check C671 keeps "here" and `show`, and "accept or
  reject" matches the CLI once `halonic proposals reject` replaces `discard` (HAL-16071).

## Covers

- inbox.proposal-page
