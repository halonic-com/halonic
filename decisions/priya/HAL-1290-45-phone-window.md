# Decision: the More page's switcher row waits for a workspace picker

- Approval: the maintainer approves this change in review of HAL-1290 (16c, the phone's bars in the window)
- Kind: internal

The requirement narrows one promise: the More page shows the workspace switcher row only once the
app gives it a workspace picker. Before, the row always showed. No test was weakened; one example
and one test are added for the page without a picker.

The row's tap opens the workspace picker sheet, which T3 builds. The Studio window now draws the
More page on a phone, and until T3 there is nothing for the row to open. The Studio shows no
control that does nothing (T2 plan, "No dead controls"), and the desktop sidebar already waits for
a workspace menu the same way (`shell.studio-window`). The row comes back, unchanged, as soon as
the app passes a picker.

## Covers

- shell.more-page
