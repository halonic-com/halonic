# Decision: an opened History version takes focus, Escape returns to its row

- Approval: https://paperclip.halonic.com/HAL/issues/HAL-12617 (row C2 of the keyboard and screen-reader check on HAL-12584; a focus fix on an approved screen with no new words, team decision, HAL-2282 rule; Liam's code review)
- Kind: user-visible
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:YuxK44sRQPTupx99IVFcO0hdIkRp5SvJpEuse5IpWeUAnYQUEyMQd8Dsu/3lmFuHsuTXVDnSf6O321EhRtpUDQ==

## What changes

- On Changes › History, Enter or a click on a version still shows its details beside the list, and focus now
  moves to the version's name there (the details' title), so a screen reader reads it and Tab carries on from
  the details instead of leaving the page.
- Escape in the details puts focus back on that version's row.
- The kit list also marks the focused cell of the current row with `aria-current`, so the picked version is
  heard where focus is.

The requirement says this and gains one example. No example is removed and no test is weakened.

## Why

The keyboard and screen-reader check found that Enter on a version seemed to do nothing with a screen reader:
focus stayed on the row, nothing was read, and the details held nothing focusable (WCAG 2.4.3, 4.1.3). The fix
follows the Inbox and the run page's step panel.

## Covers

- source-control.history-page
