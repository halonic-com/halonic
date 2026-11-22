# Decision: a window that lists no run proposals says what to do on the computer

- Task: HAL-16100
- Approval: https://paperclip.halonic.com/HAL/issues/HAL-16100 (a team decision with no board card, HAL-2282 rule: wording on the approved Inbox; finding 5 of flow check C672 on HAL-16091, with the words of row 23 of words check C671 on HAL-16090, task HAL-16104)
- Kind: user-visible

## What changes

A Studio window that reaches no agent host (a served Studio in a browser, a phone) lists no run
proposals, and said under Needs you: "Changes your runs propose show only in the desktop app, or
with `halonic proposals` in a terminal." Flow check C672 found that a phone has no desktop app and
may have no terminal, so the line said where proposals show but not what to do from there.

It now says: "Changes your runs propose show only in the desktop app, or with `halonic proposals`
in a terminal on your computer." These are the words of the designer's words check C671, row 23
(HAL-16104), which replace this task's first draft, "To see changes your runs propose, open
Halonic on your computer or run `halonic proposals` in a terminal there.": "on your computer" is
the phrase the phone's other lines already use (Library, Google setup, the Inbox's secret hold),
and the line matches the one on a proposal the window can't decide ("use the desktop app, or run
this on your computer", #5031). The line still can't tell whether any proposals are waiting, so it
says where to look rather than that none are.

The finding's other half, "accept or reject" in the Inbox against "accept or discard" in the CLI,
is in the line of a proposal the window can't decide, which #5031 (HAL-16066) rewrites. It changes
there, so the two pull requests don't edit one sentence; the CLI's `halonic proposals reject`
replaces `discard` (HAL-16071).

## Covers

- inbox.proposal-items
