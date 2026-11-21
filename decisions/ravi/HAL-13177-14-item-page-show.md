# Decision: an item page shows a view the page asks for, and focus follows it

- Task: HAL-13177
- Approval: decided by the team on HAL-13177 (Sofia's UX check C505-5 on HAL-14915; flow-agents 3.4's rule that focus never lands on something hidden, approved by the board). Liam signs on review.
- Kind: user-visible
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:uIKUtOjAcNVeMbKdA1zrpT2qeNY3fphm/JoX1BZDxy4zNp5B+gERGuAl5XKnXDKe+nDmr5alUzF+CvrpjGuMAg==

## What changes

`shell.item-page-header`: a page no longer picks `ItemPage`'s view itself with a `view` prop.
It asks through a handle, `show(view, focus?)`. The shell then remembers that view for the tab as
if the user had picked it, reopens a panel the user closed, opens the panel's own screen in a
narrow tab, and moves focus to the element the page names, or else to the panel. A new
`firstView` prop says which view a tab shows when it first opens the item, for a page that
doesn't open on the first view in its nav (the agent page opens on Configuration).

Tests: the test "shows the view the page picks, and tells it which one the user picks" in
`item-page.test.tsx` tested the `view` prop, which is gone. `item-page-show.test.tsx` replaces it
with tests for `firstView`, `onPickView`, `show` in every layout, its focus and its memory.

## Why

With `view`, a view the page picked stayed hidden when the panel was closed or shown as a button,
focus stayed where it was, and the shell stopped remembering the page's view for the tab (C505-5).
No page used `view` yet: the agent page moves onto `ItemPage` in the next pull request on HAL-13177.

## Covers

- shell.item-page-header
- packages/studio/shell/src/item-page/item-page.test.tsx
