# Decision: Settings gets a sidebar row, Ctrl K section commands and a Ctrl , focus rule

- Approval: the board-approved settings flow ([flow-settings](/HAL/issues/HAL-646)) built in [HAL-7331](/HAL/issues/HAL-7331); the package owner (Liam) approves this note in review
- Kind: internal

## What changes

`shell.settings-window` described the Settings window and how it opens. It now also says the window
takes the sections features register (`settingsSections`), so the shell can add one Ctrl K command
per registered section, and that Ctrl , while Settings is open focuses the current section's row
(desktop app only; served Studio leaves the key to the browser). The sidebar gets a Settings row,
last in the sidebar. Two examples were added for the new behaviour. Nothing was removed or
weakened: both changes are additions, and the existing examples stay as they are and are still
tested.

## Why

The approved flow gives Settings more than one way in: the sidebar, Ctrl K and the keyboard.
Without these rules the requirement would describe a window that can only be opened one way.

## Covers

- shell.settings-window
