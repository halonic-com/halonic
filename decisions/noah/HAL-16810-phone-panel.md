# Decision: the side panel opens as a full page on a phone

- Approval: HAL-16810 (T14 PR 18, flow-assistant 11.1 and 11.3, plan approved by Liam on HAL-16788)
- Kind: user-visible

`shell.panel-window` said that below 600px the window draws no side panel: T14 PR 5 left the
phone out until PR 18 builds it. Now the phone top bar at the top of a place shows the panel's
orb, and the panel opens as a full page in place of the top bar, the page and the bottom
navigation (`shell.phone-panel`, new). So the sentence and its example change: below 600px the
window draws the panel as a full page, and a panel that was open when the window narrows stays
open as that page.

## Tests

The test "draws no side panel on a phone" becomes "stays open as a full page on a phone": the same
two `expect` calls, now that the panel is drawn on a phone instead of left out. No test is removed
or weakened, and `shell.phone-panel` adds five tests.

## Covers

- shell.panel-window
