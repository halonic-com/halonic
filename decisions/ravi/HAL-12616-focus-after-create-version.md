# Decision: focus goes to the new version after Create version

- Task: HAL-12616 (a11y check C1)
- Approval: https://paperclip.halonic.com/HAL/issues/HAL-12616 (row C1 of the keyboard and screen-reader check on HAL-12584, placed by Liam; a team decision with no board card, HAL-2282 rule, because it fixes focus on an approved screen and adds no words)
- Kind: user-visible
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:oGhiQ14dLjrt/s+nz+AtYTNAYSqc0NqsE998jleA6ioA3LHttb/vk3DsAMgYScoRrkghFoX0nlbsQxgnNtj1BA==

## What changes

The existing requirement `source-control.create-version` changes in one place:

- "close the dialog, and move focus to the page heading" becomes: close the dialog and, once the page has read again, move focus to the new version's row in History, its first row, even when changes are left. Cancel or Escape give focus back to the button that opened the dialog, as they already did.
- One example is added: every change goes into the version, Create version is gone, and focus is on the new version's row.

If reading the page again fails, focus stays where it is and the failure's alert is read, because the first row would then be an older version.

Nothing is removed from the behaviour; no test is weakened or deleted. The dialog's test gains the new-row focus with every change versioned, with changes left, with History failing to read, and Cancel.

## Why

With every change in the version, Create version disappears right after the dialog closes, and focus fell to the page body (WCAG 2.4.3 Focus order). The new version's row is what the person just made and is always there, so it is the right place every time.

## Covers

- source-control.create-version
