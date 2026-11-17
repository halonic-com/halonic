# Decision: Studio marks hidden characters in a plugin's folder and file names

- Approval: the task to build this is HAL-7956, assigned by Liam from HAL-11564; Liam asked for this change in his review of the Studio pull request and approves this note
- Kind: user-visible
- Task: HAL-7956

## What changes

Studio's trust check shows the plugin's folder and backend file names with each hidden or direction-changing
character written out as a marker such as `⟦U+202E⟧`, the way the Inbox shows values. The requirement
`app.plugin-trust-sections` says so. For this, the Inbox's `markedName` moves to `@halonicjs/std` as
`markHiddenName`, and `std.hidden-characters` now says it gives a text with each such character as a marker.

## Why

Folder and file names come from the workspace. A direction override or a zero-width character could make a name
read as a different file in the very dialog where a person decides whether to trust the plugin. The command line
already escapes them. The Inbox's rule moves to the shared package so both features use one copy.

## Covers

- app.plugin-trust-sections
- std.hidden-characters
