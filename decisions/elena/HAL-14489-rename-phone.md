# Decision: renaming on a phone, a collection's chips, and the Inbox's Next, from C403 and C410

- Task: HAL-14489
- Approval: team decision under the HAL-2282 rule for a detail of approved screens, no new words (Sofia as designer, rows NS1, PT1, PT2, NS2 and CP1 of her C403 check on HAL-14497, and IX1 of her C410 check on HAL-14518); Liam reviews the pull request on HAL-14489 and signs this note
- Kind: user-visible

## What changes

- **NS1:** the rename sheet's Name field announces its error while it has the focus
  (`announceWhileFocused`, as the cron field has since #3991), so Enter in an emptied Name reads
  "Name: Give it a name." No new words.
- **PT1:** after a rename on a phone, the top bar and the window's title take the new name. The
  phone's place stacks name an item's pages again (`retitlePhonePages`) each time its kind says its
  items changed, as the desktop names its tabs again. The routine kind and the four Library kinds
  had no `subscribe`, so their desktop tabs kept the old name too; they now follow their host's
  `subscribe`.
- **PT2:** the phone top bar's title wraps to a second line and is cut only after two
  (`line-clamp-2`), so a long name isn't cut to its first word. Noah can tune the look.
- **NS2:** `shell.rename-sheet` now says what the kit's form sheet does on a phone (focus on the
  title, ✕ to close, no **Cancel**), and the sheet drops its unused `autoFocus`; on desktop the
  Dialog still focuses Name, its first field.
- **CP1:** `FilterChips` takes `flush`, which drops its 16px sides; the collection page sets it, so
  its chips line up with the title and the grid.
- **IX1:** `main` already wraps the Inbox's **Next** label as one run of text (HAL-13830 IN2,
  #4228), so "· 1 left" wraps with the title at 195px. This branch moves the screen reader's count
  into that same span, so the Button has one label and its name reads "Next: _title_, 1 left" with
  no stray space before the comma. `inbox.page`'s phone test now expects that one label.

`shell.rename-sheet`, `shell.item-tab-names`, `shell.phone-bars`, `kit.filter-chips`,
`library.collection-page` and `inbox.approval-card` say so; all but the last gain examples. One
phone-bars test expected `truncate` on the title and now expects `line-clamp-2`; no test was weakened or skipped. New tests cover the announced
error with focus in Name, the sheet on a phone, a renamed item's phone pages (unit, and in the
window at 400px, where the top bar and `document.title` follow), the routine and Library kinds'
`subscribe`, the flush chips row, and Next's single label.

## Why

Sofia's C403 check of #4000 found the rename sheet's error unread with focus in Name, a phone's top
bar and window title still showing the old name after a rename, a long phone title cut to "Openst…"
at 195px, a requirement that described a desktop dialog for a phone sheet, and a collection's chips
16px further in than its title and grid. Her C410 check found the Inbox's Next count wrapping as its
own column at 195px, with a stray space in the name.

## Covers

- shell.rename-sheet
- shell.item-tab-names
- shell.phone-bars
- kit.filter-chips
- library.collection-page
- inbox.approval-card
