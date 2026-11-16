# Decision: the desktop app's status bar shows the resources item

- Task: HAL-11118 (part 3, the app wires the resources watch)
- Approval: HAL-11118 asks for this item; Liam reviewed the wording of the requirement on HAL-11132 and signs this note as the CTO
- Kind: internal

## What changes

`studio.entry`: the desktop app gives the window a watch over the shell's `resource_report` command, so the status bar shows the memory and free-disk item (`shell.resource-status-item`), and stops the watch with the window. The served Studio has no such command, so it gets no watch and its status bar shows no item. Two examples are added, one for the desktop app and one for the served Studio. No existing example was removed or weakened.

## Why

The status bar item needs numbers from the desktop shell. The served Studio can't reach that command, so it shows nothing instead of a broken item.

## Covers

- studio.entry
