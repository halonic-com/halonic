# Decision: a run says a plugin backend that can't run in the sandbox here is off on this computer

- Task: HAL-15879, from flow check C642 #5 on HAL-15857
- Approval: https://paperclip.halonic.com/HAL/issues/HAL-15879 (a fix that makes approved run output say what `plugin list` already says, with its approved lines, so a team decision under the HAL-2282 rule; Liam's code review signs this note)
- Kind: user-visible

## What changes

- `cli.plugin-local-tools` (edited): when a plugin's backend didn't start because its code can't run in the sandbox here (`PluginBackendNotFencedError` anywhere in the error's chain of causes, with a reason code Halonic knows), the run's warning says "! The backend of the plugin *Name* is off on this computer, so its tools are off in this run.", then the reason and its fix, "Or allow this in the Halonic desktop app: Settings › Plugins › *Name* › Review. …" (the lines `plugin list` shows, `offHereReasonLines`), then the docs line and the code. Before, it said "didn't start" and the error's own text, "the sandbox isn't available here (container) and running without it isn't allowed yet". A sentence and an example are added; nothing is taken out. A code this version doesn't know keeps the error's words.

## Why

C642 #5: `plugin list` said "! off on this computer" with the reason, its fix and where to allow it, while the run printed a raw error with no fix and no docs line. The agent host already reads the same error (`host-plugin-backends.ts`).

## Docs

The plugins guide's troubleshooting table names the run's warning in the "off on this computer" row.

## Covers

- cli.plugin-local-tools
