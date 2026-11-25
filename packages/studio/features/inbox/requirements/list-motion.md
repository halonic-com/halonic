# inbox.list-motion

- Status: active
- Since: unreleased
- Source: HAL-18557; design review HAL-18481, motions 2 and 6 (approved by the board on HAL-10)

When Needs you changes, the Inbox shall glide the rows that stay to their new place and drop in each row that came, with the kit's motions, and shall hold a change that comes while a pointer is pressed on the list until the press ends, so no row moves under it. With one pane at a time, the Inbox shall slide the open item in from the end as it opens and the list back in from the start with **Back to Inbox**; with two panes side by side, nothing slides. Under reduced motion, only the kit's short fades remain.

## Examples

- Given the Inbox with one item,
  when a second item comes,
  then the first row glides down and the new row drops in.
- Given a narrow window,
  when you open an item and then press **Back to Inbox**,
  then the item slides in from the end, and the list slides back in from the start.
