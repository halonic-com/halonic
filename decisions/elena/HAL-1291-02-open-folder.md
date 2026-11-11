# Decision: the desktop app starts on Welcome instead of one unnamed workspace

- Approval: the board-approved workspace flow ([flow-workspace](/HAL/issues/HAL-177#document-flow-workspace) 2.1 and 2.2) built in [HAL-1291](/HAL/issues/HAL-1291); the package owner (Liam) approves this note in review
- Kind: internal
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:HH6SyAO4dO63vJNj5E5ziRMXGvIVQgk3mR8IWfw4Ya/MSb9F9y5cJvR9ljz0NUjyFT++blR4ftHwewg6ryD6Bg==

## What changes

`studio.entry` said the app opens one workspace with its services and shows one Studio window for
it. That stays true for the served Studio. The desktop app now starts on the shell's Welcome screen
and opens the folders the user picks, each with its own services, as the new requirement
`studio.open-folder` says. When the app stops, it disposes every open workspace's services, not
the one workspace's. The source line adds HAL-1291. No example was removed or weakened: the served
example and the stop example are unchanged and still tested.

## Why

T2 drew one unnamed workspace with no folder because nothing could open a folder yet. T3 builds the
approved flow: Welcome, Open folder, the switcher. Keeping the old sentence would describe a desktop
app that no longer exists.

## Covers

- studio.entry
