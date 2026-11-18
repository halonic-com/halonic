# Decision: Rename from a file's tab shows the Files view on the sidebar

- Task: HAL-12215
- Approval: Liam approves this change on HAL-12215, for HAL-12215. Liam decided to add an optional `showSidebarView(viewId)` to `WorkspaceContext` and call it from the tab's Rename and F2 on HAL-12215; it completes the approved Rename of files flow 6.1, so there is no board card.
- Kind: user-visible

## What changes

**Rename** in a file tab's ⋮ menu, and F2 in the tab, now also show the Files view on the sidebar's switch, so the user sees the row whose name field opens. Before, when the sidebar showed another view, Rename did nothing the user could see, and the name field opened later by surprise when they showed Files.

The tab calls the optional `showSidebarView(viewId)` that `WorkspaceContext` already has on `main` (HAL-12227, requirement `shell.sidebar-view-request`), so this pull request doesn't change the shell. A phone has no `showSidebarView`; there the tab's Rename works as before. The requirement `files.ui.file-tab-header` gets the sentence and an example, and the example has a test. No test was weakened or skipped.

## Why

Sofia found that Rename from the tab had no visible effect when the sidebar didn't show Files (F1 of the Studio check HAL-12213, checklist 8.5).

## Covers

- files.ui.file-tab-header
