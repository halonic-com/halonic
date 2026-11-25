# studio-click-test.basics-steps

- Status: active
- Since: unreleased
- Source: HAL-18716 point 6 (the board's yes, 25 Nov), HAL-18866

The click test shall check, after the steps of `studio-click-test.steps`, the Studio basics on the installed app, in order:

1. **The demo is the shown workspace:** the window title names the page, the workspace and "Halonic", joined by " · ", and the sidebar's workspace switcher opens the workspace menu, whose Recent lists the demo's `Acme sample` folder with the Demo tag, then **Open a folder…**.
2. **The window tabs:** **New tab** adds one tab to the Open tabs strip, Ctrl W then closes the active tab and Ctrl Shift T brings it back, each seen in the strip's count of tabs.
3. **Close workspace:** the workspace menu's **Close workspace** shows Welcome again, with its title, its line, the demo's folder under Recent with the Demo tag, and **Open demo**.

The Close workspace step shall come last of these, because it leaves the window on Welcome.

## Examples

- Given a window titled "Support reply · Halonic",
  then the demo step fails as `WRONG_TITLE`.
- Given a Ctrl W that leaves the strip at 2 tabs,
  then the tabs step fails as `TAB_NOT_CLOSED`, with "Ctrl W: 2 tabs before, 2 after.".
- Given a Welcome whose Recent row has no Demo tag after Close workspace,
  then the Close workspace step fails as `NO_WELCOME`, naming "Demo".
