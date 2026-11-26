# Decision: the Inbox's rows offer Mark as read or Mark as unread on hover, and the dot sits under the chip

- Approval: https://paperclip.halonic.com/HAL/issues/HAL-19492
- Kind: user-visible

The read and unread rule the board approved on HAL-19192 put **Mark as unread** on a row's hover
as well as in the item's ··· menu, and Sofia's sketch D there shows each row's hover action:
**Mark as read** on a new row, **Mark as unread** on a read one, in place of the row's end. This
pull request builds it, through a new `hoverAction` on the kit's `plain` List
(`kit.list-plain-action`, new). The action sits in a cell of its own, so its words stay out of
each row's text and name, and → reaches it (Sofia's acceptance row A2.3 on HAL-20100). The open
row offers neither, as the Messenger's open chat doesn't. It also puts an unread row's dot under
its trailing chip (Late, Setup), Sofia's nit on HAL-20008, so the dots line up in one column.

`inbox.read-marks` gains the hover action and an example, and takes Nora's wording nit from #6676:
the word "new" is "the heading's word for it", since a fixed setup row says it but isn't counted.
`inbox.setup-items` keeps its rule, "no Approve, Reject or Delete"; its example said the row "has
no button", and now says "no button but its Mark as read on hover".

Nora's review of #6686 found that keyboard focus, which now fills a `plain` List row
`surface-muted` so the action sits on the fill, wasn't marked for the kit's `on-muted:` variant,
so an Avatar's neutral tile (the Inbox's approval, person-step and setup marks) lost its circle on
the focused row. The row now sets `data-focus-visible-fill="muted"`, which `on-muted:` reads with
`:has(:focus-visible)`, so a click's focus still fills nothing. `kit.avatar-on-row-fill` and
`kit.list-plain` name keyboard focus among a plain row's fills, and each gains it in an example
or its rule.

Two existing tests change:

- `setup-row.test.tsx` (`inbox.setup-items`): the setup row's text now ends "Setup" then "new",
  since the dot sits under the chip. Instead of expecting no button in the grid, it lists the
  grid's buttons and expects exactly each row's "Mark as read", so any other button still fails it.
- `read-marks-page.test.tsx` (`inbox.read-marks`): the fixed setup row's check is anchored
  (`/new$/`, Nora's nit), and a new test covers the hover actions.

## Covers

- inbox.read-marks
- inbox.setup-items
- kit.avatar-on-row-fill
- kit.list-plain
- packages/studio/features/inbox/src/ui/setup-row.test.tsx
- packages/studio/features/inbox/src/ui/read-marks-page.test.tsx
