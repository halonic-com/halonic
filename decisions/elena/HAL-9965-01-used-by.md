# Decision: the plugin page gets its "Used by" section

- Approval: the section is in the board-approved plugin screens design, section 7 (HAL-1739); Liam signs this note with the pull request
- Kind: user-visible
- Task: HAL-9965 (slice of HAL-9383, B27)

## What changes

`plugins.plugin-page` gains "Used by": the connectors that use the plugin, each as "*connector* · in *workspace*". While Halonic looks it says "Checking which connectors use it…"; with none it says "No connector uses it yet."; when the check fails it says "Halonic couldn't check which connectors use it." and never "none". It uses the same `usedBy` action as the Remove dialog. Nothing was removed or weakened.

## Why

The design lists "Used by" on the page, and it was missing, so a person could not see what a change or a removal would reach before opening the Remove dialog.

## Decided by the team

- It is its own section after What it adds, not a group inside it: a plugin that adds nothing, or can't load, can still have connectors, and those are the ones a person most needs to see.
- It lists connectors in every workspace on this computer (plugins are per computer), so each line names its workspace. The design said "in this workspace".
- "No connector uses it yet." is new wording, in the voice of the lines around it (Sofia can change it in review).

## Covers

- plugins.plugin-page
