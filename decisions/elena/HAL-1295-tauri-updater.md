# Decision: the updater interface gets a scenario for listeners that stop

- Approval: the user approves this note on HAL-9010 (the change adds a scenario and changes no existing behaviour)
- Kind: internal
- Task: HAL-1295

## What changes

`settings.updater-interface` gets one more scenario: with the desktop app, two listeners following
the updater and a third that has stopped, when the shell reports a change, the two hear it, the
third does not, and the shell was asked to watch once. No existing scenario was removed or
weakened, and no reference behaviour changes.

## Why

The updater over the shell's update commands (HAL-1295) shares one watch on the shell between all
listeners, for About Halonic and the status bar. The scenario pins down that a stopped listener
stops hearing changes and that adding listeners doesn't ask the shell to watch again.

## Covers

- settings.updater-interface
