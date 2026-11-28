# shell.home-view

- Status: active
- Since: unreleased
- Source: HAL-20741; HAL-20617 build plan, phases P3 and P5; HAL-20673 rail flows, section 2; HAL-20773

The shell shall let one feature set Home's view through `home.setView`, as two slots: a list column and a content pane. The shell shall own Home's layout, and the feature only fills the slots. The shell shall show the list column beside the content pane, about 34% of the page wide and at most 380px, give the content pane Home's sections as the shell draws them, and give both slots the context of the feature that set them. The shell shall keep which item is open, so an item the list column opens shows in the content pane. The content pane shall not be a second main landmark. While the window is narrower than 900px, the shell shall show one pane at a time: the list column, or the open item under "Back to Home", which leads back to the list column. When an item opens in one pane, the shell shall move the focus to "Back to Home"; when it closes, the shell shall move the focus to that item's row, or to the first row if that row is gone. Where the Studio shows the phone layout, the shell shall show Home's sections alone until the phone's own Home is designed. While no feature sets Home's view, the shell shall show Home's sections alone. If a second feature sets it, then the shell shall throw a `ShellError` that names both features.

## Examples

- Given no feature sets Home's view,
  when Home is shown,
  then it shows its sections alone, as before.
- Given _home_ sets Home's view,
  when Home is shown in a 1280px window,
  then _home_'s list column, at most 380px wide, shows beside its content pane, which holds Home's sections.
- Given _home_'s list column opens "triage",
  when the content pane draws again,
  then it gets "triage" as the open item.
- Given _home_ sets Home's view and the window is 800px wide,
  when the person opens "triage" in the list column,
  then only the content pane shows, under "Back to Home", which shows the list column again.
- Given _home_ sets Home's view and the window is 800px wide,
  when the person opens "triage" from its row and then presses "Back to Home",
  then the focus is on "Back to Home" while "triage" is open, and on the "triage" row after.
- Given _home_ sets Home's view, the window is 800px wide and "triage" is open,
  when "triage" leaves the list and the person presses "Back to Home",
  then the focus is on the first row.
- Given _home_ sets Home's view,
  when Home is shown on a phone,
  then it shows Home's sections alone.
- Given _home_ and _dashboard_ both set Home's view,
  when the Studio starts,
  then it fails with "Home's view is set by both "home" and "dashboard"".
