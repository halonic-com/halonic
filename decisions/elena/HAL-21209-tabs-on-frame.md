# Decision: the window tabs sit on the frame, right above the framed panel

- Approval: https://paperclip.halonic.com/HAL/issues/HAL-21209 (found in the post-merge look check HAL-21195 of #6920, against the approved mockup, v26 on HAL-20617). Liam approves the change in review on HAL-21209.
- Kind: user-visible
- Signature:

## What changes

`shell.frame`: the window tabs no longer are the framed panel's first row, on its fill. They sit on the frame (`--color-app-frame`), right above the framed panel, still starting at its start edge, so the active tab, in the panel's fill, joins it as v26 draws it. An inactive tab's hover fill shows again, and in a narrow window the open-tabs button sits on the frame, not against the panel's rounded corner. Under the tabs the panel's top start corner is square, so the active first tab's start line runs into the panel's.

Tests changed to follow:
- `frame-tabs.test.tsx`: the first test checked the tabs were inside the framed panel; it now checks they are outside the element with the panel's fill, on no fill of their own, right before the panel with no inset, and that the panel holds `main`.
- `shell-frame-sidebar.test.tsx`: the 8px beside the sidebar was checked on the framed panel; it is now checked on the column that holds the tabs and the panel, which moved the margin there, and that column has no fill either. The panel's corners, line and fill are still checked on the panel.
- `studio-window.test.tsx`'s window test checked the tabs were in the framed panel; it now checks they are in the tab row and not in the panel.
- `e2e/rail-frame.spec.ts`: the rail's first button is level with the top of the column that holds the tabs and the panel (where the panel's top was before), rather than with the panel's top, which now sits under the tabs. A new browser test checks the tab row has no fill, and the active tab's fill is the panel's and differs from the frame's.

No test was skipped or weakened.

## Why

The approved mockup puts the tab strip on the frame colour above the content pane. On the panel's fill the active tab was white on white and an inactive tab's hover fill didn't show (HAL-21195).

## Covers

- shell.frame
