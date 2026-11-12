# Decision: Settings can run a feature's command by its id

- Approval: the board-approved settings flow (flow-settings, HAL-646) built in HAL-8027; the package owner (Liam) approves this note in review (HAL-8032)
- Kind: internal

## What changes

`shell.settings-window` described how the window gives views a way to open Settings. It now also
says the window gives them `runCommand`, which runs a feature's command by its id and says whether
a feature added it, and that a failing command shows the same danger toast as in Ctrl K. One
example was added for it. Nothing was removed or weakened: the change is an addition, and the
existing examples stay as they are and are still tested.

## Why

The Models and Trust sections in Settings open another feature's page. A section view cannot import
that feature, so it asks the window to run the feature's command instead.

## Covers

- shell.settings-window
