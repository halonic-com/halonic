# shell.sidebar-footer

- Status: active
- Since: unreleased
- Source: HAL-18672; plan approved on HAL-18710

The Studio sidebar shall draw the one item a feature sets with `studio.sidebarFooter.add` at its bottom left, below the places and Settings, and draw nothing there while no feature sets one. When a second feature sets one, the shell shall throw a `ShellError` naming both features instead of picking one.

## Examples

- Given a feature that sets a footer item,
  when the sidebar is drawn,
  then the item's view is in the sidebar's footer.
- Given no feature sets a footer item,
  when the sidebar is drawn,
  then the sidebar has no footer.
- Given two features that each set a footer item,
  when the shell is created,
  then it throws a `ShellError` that names both features.
