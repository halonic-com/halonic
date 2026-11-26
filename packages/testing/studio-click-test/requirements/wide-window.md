# studio-click-test.wide-window

- Status: active
- Since: unreleased
- Source: HAL-19048

When a step of `studio-click-test.basics-steps` runs, the click test shall first switch to Studio's main window and size it to 1280 × 800, where Studio docks the sidebar with its workspace switcher and shows the Open tabs strip instead of the narrow window's ☰ Places and "1 open tab ▾", and when the step ends, shall give the window back the size it had, so the steps after it see the window the app opened. If the window can't be sized to at least 900px wide, the step shall fail as `NO_WIDE_WINDOW`, saying why; if a step that passed can't give the window its size back, it shall fail as `WINDOW_NOT_RESTORED`; a step that fails shall name the size it ran in.

## Examples

- Given the app's 800 × 600 window,
  when the tabs step runs,
  then it runs in a 1280 × 800 window, and the window is 800 × 600 again afterwards.
- Given the session on the Messenger window,
  when the demo step runs,
  then it sizes Studio's main window, not Messenger's.
- Given a driver that answers 1024 × 768 instead of the window's size,
  then the demo step passes in that window.
- Given a driver that refuses to size the window with "unsupported operation",
  then the demo step fails as `NO_WIDE_WINDOW`, naming "unsupported operation".
