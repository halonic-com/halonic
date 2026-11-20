# Decision: an ActionBar button can be described by a text on the page

- Task: HAL-1302
- Approval: https://paperclip.halonic.com/HAL/issues/HAL-14026 (GB2 from the C289 check of #4113: the shared-versions line becomes Go back's `aria-describedby`; a team decision with no board card, HAL-2282 rule, because it is a detail of the approved Go back screen and adds no words)
- Kind: user-visible
- Signature:

## What changes

The kit's `ActionBar` requirement (`kit.action-bar`) gains one clause: a button may take the `id`
of a text that describes it. The bar passes it to the kit's `Button` as its `aria-describedby`. While
the button is unavailable, the `Button` puts its reason first and this text after it, as it already
does on the desktop. Buttons without it
draw and behave exactly as before.

Go back to this version uses it on the phone, so the line "Your team keeps the versions you shared
after this one. Going back makes a new change you can share." is read with the button, as it
already is on the desktop.

Nothing is removed or weakened. The new clause has its own test in `action-bar.test.tsx`; Go back's
description is checked in `ui/go-back.test.tsx`.

## Why

Someone who Tabs to Go back on the phone didn't hear the line shown right before it (WCAG 1.3.1).
The phone's bottom bar had no way to describe a button.

## Covers

- kit.action-bar
