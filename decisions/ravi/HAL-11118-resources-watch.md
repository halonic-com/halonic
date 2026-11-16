# Decision: the desktop app gives the status bar its resources watch

- Requirement: `studio.entry` (`apps/studio/requirements/entry.md`)
- Task: HAL-11118 (part 3, the app wires `watchResources`); scope set by Liam on HAL-11121
- Approval: Liam signs this note as the CTO
- Kind: internal

## What changes

`studio.entry` now says the desktop app gives the window a watch over the `resource_report` command, so the status bar shows the memory and free-disk item (`shell.resource-status-item`), and stops the watch with the window. The served Studio has no such command, so it gets no watch and no item. Two examples are added; none is removed or changed.

## Why

The item was built (#3060) but never reachable: `apps/studio` passed no watch. The command landed in #3184 and the window prop in #3182.

## Covers

- studio.entry
