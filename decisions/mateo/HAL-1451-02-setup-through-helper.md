# Decision: set up and remove the Windows sandbox through the signed helper

- Task: HAL-1451 (S1: set up the agent sandbox from the installed app; Julian's design on HAL-1415)
- Approval: the task asks for this change; Liam approves this note in review on [HAL-1451](/HAL/issues/HAL-1451)
- Kind: behaviour

## What changes

Two active requirements of the sandbox-srt adapter are widened:

- `sandbox-srt.setup` is no longer only for the installer: Studio and the CLI use it too. When `halonic-sandbox-elevate.exe` is next to the program that runs, the install goes through that helper with one administrator prompt. A failed setup now says how it ended (`cancelled`, `failed` or `check_failed`) next to its one-line reason, and a helper exit code is never the whole reason: it comes with the helper's sentence.
- `sandbox-srt.remove` is used by Studio as well as the uninstaller, goes through the same helper when it is there, and says how it ended (`cancelled` or `failed`).

Without the helper next to the agent host nothing changes: setup and removal use srt's own elevation, as before.

## Why

S1 needs Studio's Settings button, `halonic sandbox setup` and the installer to share one code path with one UAC prompt (HAL-1451, one-prompt answer on HAL-1415). Studio's Callouts need the ending (`cancelled` shows **Try again**), not only a sentence.

## Covers

- sandbox-srt.setup
- sandbox-srt.remove
