# Decision: the workspace page places other features' sections and adds `workspace.open-models`

- Approval: Liam decided this on HAL-8973 (from the HAL-8970 review of PR #2578); the package owner (Liam) approves this note in review
- Kind: internal
- Task: HAL-8973

## What changes

`workspace.workspace-page` now also says that the Workspace feature adds the command
`workspace.open-models` next to `workspace.open-trust`, and that the page places the sections other
features add to the `workspace` item kind (`shell.item-page-sections`) after Trust. It no longer says
the page's other sections come with the features that own them. No example was removed or weakened.

## Why

The Models section comes from the Models feature through the shell's existing `itemPage.addSection`,
not a new point only for this page. Settings already runs `workspace.open-models`, and command ids
stay under their owner's prefix, so the Workspace feature owns it. For now it opens the workspace page.

## Covers

- workspace.workspace-page
- packages/studio/features/workspace/src/feature.test.ts
