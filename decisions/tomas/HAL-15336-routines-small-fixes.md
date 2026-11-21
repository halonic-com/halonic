# Decision: the phone's Rename sheet focuses Name, not its title

- Task: HAL-15336
- Approval: Sofia's Routines UX check, RT17 (https://paperclip.halonic.com/HAL/issues/HAL-15304#document-ux-check), assigned on HAL-15336. A team decision on an approved screen, with no board card (HAL-2282 rule). Liam approves it in the review of this pull request.
- Kind: user-visible

## What changes

On a phone, the Rename sheet from an item page's ⋮ (routines, collections) now gives the focus to
its **Name** field with the name selected, so typing replaces it. Before, it focused the sheet's
title, and a person had to move to the field first.

The active requirement `shell.rename-sheet` is updated to say this. Its phone test now checks
that Name has the focus with its text selected, instead of the title; it still checks ✕ and
**Rename**. No test was removed, weakened or skipped.

## Why

Component specs 15.3: a form sheet focuses its first field, as New routine does. Found as RT17 in
Sofia's UX check of the Routines area (HAL-15304).

## Covers

- shell.rename-sheet
