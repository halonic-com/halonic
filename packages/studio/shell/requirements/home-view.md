# shell.home-view

- Status: active
- Since: unreleased
- Source: HAL-20741; HAL-20617 build plan, phase P5; HAL-20673 rail flows, section 2

The shell shall let one feature set Home's view through `home.setView`, as two slots: a list column and a content pane. The shell shall show the list column beside the content pane, give the content pane Home's sections as the shell draws them, and give both slots the context of the feature that set them. The shell shall keep which item is open, so an item the list column opens shows in the content pane. While no feature sets Home's view, the shell shall show Home's sections alone. If a second feature sets it, then the shell shall throw a `ShellError` that names both features.

## Examples

- Given no feature sets Home's view,
  when Home is shown,
  then it shows its sections alone, as before.
- Given _home_ sets Home's view,
  when Home is shown,
  then _home_'s list column shows beside its content pane, which holds Home's sections.
- Given _home_'s list column opens "triage",
  when the content pane draws again,
  then it gets "triage" as the open item.
- Given _home_ and _dashboard_ both set Home's view,
  when the Studio starts,
  then it fails with "Home's view is set by both "home" and "dashboard"".
