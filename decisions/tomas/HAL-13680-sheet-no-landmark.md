# Decision: the narrow window's sheet dialog has no landmark inside it

- Approval: decided by the team (HAL-2282) on HAL-13680, Sofia as designer, from the C210 check of #3852 (HAL-13658); Liam signs this note with the pull request
- Kind: user-visible
- Task: HAL-13680

## What changes

`kit.side-panel`: a panel given `dialogTitleId` already drew a plain `<div>` instead of its `<aside>`. Its header (Back and the title) and its footer now draw as plain `<div>`s too. Without `dialogTitleId`, nothing changes. Nothing changes on screen either: the same classes, the same order.

`kit.header-badge-sheet-dialog`: "no region inside it" becomes "no landmark inside it". The kit's test now also rules out `header`, `footer`, `banner` and `contentinfo` inside the dialog, and `kit.side-panel` gets an example and a test for the plain header and footer.

No test was weakened.

## Why

Without the `<aside>` round them, a `<header>` and a `<footer>` have no sectioning parent, so browsers map them to the window's `banner` and `contentinfo`. The C210 check found Chromium's tree reading dialog "Workspace" › banner › Back, "Workspace": a screen reader announced "banner" inside the dialog and listed it under landmarks as if it were the window's own header (WCAG 1.3.1). A `<div>` keeps the layout and drops the landmark.

## Covers

- kit.header-badge-sheet-dialog
- kit.side-panel
