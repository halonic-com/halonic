# Decision: a Library item page's ⋮ goes in the phone's top bar

- Task: HAL-12278
- Approval: https://paperclip.halonic.com/HAL/issues/HAL-12278 (Liam's design check on HAL-12234 against the approved phone layout 1.1 and UX 9.13; a team decision with no board card, HAL-2282 rule, because it builds on approved screens)
- Kind: user-visible

## What changes

The Library's phone requirement (`library.library-phone`) gains one sentence: where an item page is
under the phone's top bar, its ⋮ goes there, after the item's name, and not in the page. That is
the phone layout the board approved (phone layout 1.1: Back, name, ⋮), which the page couldn't
follow until the shell let a page put buttons in the top bar (HAL-12278, #3540).

What the ⋮ offers doesn't change: Open as file, and Delete only for skills and collections. On the
desktop the ⋮ stays in the page header.

Nothing is removed or weakened. The sentences before it stay word for word; the requirement gains
one example, covered by `item-trash-phone.test.tsx`.

## Why

The approved phone layout puts an item's ⋮ in the top bar. Until now the page had no way to put it
there, so it drew it in the page instead.

## Covers

- library.library-phone
