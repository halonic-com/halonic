# Decision: Settings says "phone" on the phone's Settings page, and the view-only Assistant shows its Not set up line and local-only warning

- Task: HAL-9452 (design check B15 of HAL-9385)
- Approval: Sofia's design check on HAL-9316 and the wording of microcopy revision 99; a small wording detail on an approved screen, decided by the team (board, HAL-2282)
- Kind: user-visible
- Signature: pending

## What changes

`settings.saved-line` (the shell's saved line) and `settings.ai-agent-view-only` change:

- On the phone's Settings page, the line under Appearance and Formats reads "Saved on this phone. Your computer keeps its own." instead of "…The computer running Halonic keeps its own." A browser window still reads "Saved in this browser. …".
- The view-only Assistant reads "View only on a phone. Change the assistant on your computer." on the phone's page; elsewhere it keeps "View only here. Change the assistant on the computer running Halonic."
- The view-only Assistant now also shows "Not set up. Assistant chats use each workspace's model aliases." while no provider is set, and the local-only warning when the open workspace is local only and the model isn't local. The editable view already did both.

Tests changed: none weakened. New tests cover the phone saved line, the phone view-only line, the Not set up line and the warning (with and without Local on). Examples were added to both requirements; none removed.

## Why

Design check B15: the phone page said "the computer running Halonic" as if the person were on a browser, and the view-only Assistant lacked two lines the editable one has.

## Covers

- shell.settings-saved-line
- settings.ai-agent-view-only
