# Decision: New workspace… joins the workspace menu and the Welcome screen

- Task: HAL-8714
- Approval: Liam approves this note in review on the review task HAL-8814
- Kind: user-visible

## What changes

The requirement `workspace.workspace-menu` says where **New workspace…** sits: just above
**Open a folder…**, and only when the app gives the window the New workspace dialog. The
requirement `shell.welcome-open` adds a secondary **New workspace…** button under **Open folder**,
shown under the same condition. Both open the dialog that merged in the previous pull request.

## Why

Both requirements already said that New workspace… "joins the menu with the dialog it opens".
This pull request gives the place and the condition, so the menu never has a row that does
nothing. No new wording: the label comes from the approved microcopy (4.5).

## Tests

No test was weakened or skipped. Tests were added for the menu row, the Welcome button and
creating a workspace from Welcome.

## Covers

- workspace.workspace-menu
- shell.welcome-open
