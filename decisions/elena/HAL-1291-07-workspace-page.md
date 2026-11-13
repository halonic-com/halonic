# Decision: the workspace menu gets Workspace settings…, which opens the workspace page

- Approval: the board-approved workspace flow (flow-workspace, HAL-177, 2.1a and 6) built in HAL-1291; the package owner (Liam) approves this note in review
- Kind: internal

## What changes

`workspace.workspace-menu` said that Workspace settings… joins the menu with the page it opens. The
page now exists (`workspace.page`), so the menu lists **Workspace settings…** between **Open a
folder…** and **Close workspace**, as flow-workspace 2.1a draws it. New workspace… still waits for
its dialog.

## Why

The Trust section had no page to sit on, so a person could not reach Remove trust. The row opens the
page and was held back only so that the menu would not have a row that does nothing.

## Covers

- workspace.workspace-menu
