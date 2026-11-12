# Decision: Halonic's own program never falls back to srt's own elevation

- Task: HAL-1451 (S1: set up the agent sandbox from the installed app; Julian's S-3 on HAL-7385)
- Approval: the task asks for this change; Liam approves this note in review on [HAL-1451](/HAL/issues/HAL-1451)
- Kind: internal

## What changes

`sandbox-srt.setup` and `sandbox-srt.remove` get one rule each. In Halonic's packaged agent host (a Node single executable, `isSea()`), a missing `halonic-sandbox-elevate.exe` ends the setup or removal as `failed`, with the reason "Halonic's sandbox helper is missing. Reinstall Halonic" and code 38. srt is not asked to elevate itself. Only under Node, as for the CLI installed from npm, does srt still ask for administrator rights itself, as before.

## Why

Once the helper ships next to the agent host (#2146), a missing helper in the packaged app means someone removed it from a folder the user can write to. Falling back would elevate srt-win from that same folder: the risk the helper removes (HAL-1415, risk 1), and an "Unknown publisher" prompt from Halonic's own Set up button, which the UX checklist (HAL-1444, 1.3) promises never happens. An npm install has no signed file to rely on, so the CLI under Node keeps the fallback, as Julian agreed on HAL-7385.

The sentence for code 38 is for Maya to check, like the other helper sentences.

## Covers

- sandbox-srt.setup
- sandbox-srt.remove
