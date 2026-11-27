# shell.sidebar-scroll

- Status: active
- Since: unreleased
- Source: the board's request on HAL-20556 (rows in the sidebar should scroll in the sidebar, with no window scrollbar)

When the places don't fit Studio's sidebar, they shall scroll inside the sidebar, below the workspace switcher and the Search box, which shall stay in place. The places shall take the room the sidebar has left and no more, so a long sidebar never makes the window scroll.

## Examples

- Given more places than fit a 700px-high window,
  when the sidebar shows them,
  then the places scroll inside the sidebar, and the switcher and Search stay at its top.
