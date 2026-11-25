# Decision: the signed-out page shows in every layout

- Approval: Liam asked for it in the review of #5987 (HAL-18216); Liam signs this note with the pull request
- Kind: user-visible
- Task: HAL-18305

## What changes

`account-menu.sign-out` says the signed-out page stays in every layout, also on a phone page under
a place, where the window draws no menu. Before, it said only that the page stays when the window
draws the menu again in another place. The sentence that ran past the wrap width is wrapped again;
the rest of the text is the same.

## Why

The phone's top bar draws the title bar's items only at the top of a place, so after **Sign out** a
phone page under a place drew no signed-out page and showed the Studio behind it. The page now
comes from the feature's dialog host, which the window draws once in every layout. The tests only
gained cases: the item's tests draw the dialog host next to the item, as the window does.

## Covers

- account-menu.sign-out
