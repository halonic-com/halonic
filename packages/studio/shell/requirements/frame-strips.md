# shell.frame-strips

- Status: active
- Since: unreleased
- Source: HAL-13433 (first-run build 5, build notes 2); first-run-flow 2 and 5, "the first-run bar under the top bar"

The shell shall let a feature add a strip under the top bar only through the point `strips.add`, and list the strips by `order`, lowest first, then by `id`. The window shall draw each strip's view with the context of the feature that added it: on the desktop at the top of the panel, above the sidebar and the page, and on a phone under the top bar; in both, after the engine's line. While no strip's view draws anything, the strips shall take no room. A strip whose view fails to load or draw shall show nothing, and the other strips shall stay.

## Examples

- Given _first-run_ adds the strip `first-run.bar` (order 10) and _remote_ adds `remote.notice` (order 5),
  when the strips are listed,
  then the order is `remote.notice`, `first-run.bar`.
- Given a strip whose view draws "1 Demo",
  when the window shows on the desktop,
  then "1 Demo" is inside the panel, before the page's `main`.
- Given a strip whose view draws nothing,
  when the window shows,
  then the strips take no room.
