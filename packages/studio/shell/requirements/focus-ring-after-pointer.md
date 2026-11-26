# shell.focus-ring-after-pointer

- Status: active
- Since: unreleased
- Source: HAL-19399 G9 (Sofia's first-run walk-through of the 0.2.0 build, HAL-19383)

When the user last pressed a pointer, a heading that code focused, such as a page's title when the page opens, or Welcome's start line, shall keep focus but show no focus ring; after the next key press, other than a modifier alone, it shall show the ring again, so a keyboard user always sees where focus landed. Studio shall tell the two apart by marking the window `data-input="pointer"` or `data-input="keyboard"` on each press, since WebKit counts every focus from code as visible; the mark shall outlast the window's frame, so a press that opens a workspace still counts when its first page's title takes focus. In Windows high-contrast mode the heading's outline shall still show, as every focus does there.

## Examples

- Given the user clicks **Open demo**,
  when the workspace opens on the Inbox and its title takes focus,
  then the window is marked `data-input="pointer"` and the title shows no ring.
- Given the user then presses Tab or Alt ←,
  when focus moves,
  then the window is marked `data-input="keyboard"` and a heading that takes focus shows the ring.
