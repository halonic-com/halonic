# Decision: the phone's Settings section pages get the phone's own look

- Approval: Liam decided the split and the scope on HAL-7860 and HAL-7919 (HAL-7832 part 3); the requirements now say what the board-approved flow-settings 13 and mc 13.2 already show, a team decision with no board card (HAL-2282 rule)
- Kind: internal
- Task: HAL-7919

## What changes

The shell tells each section's view where it is drawn: `surface` is `"window"` in the Settings dialog and `"phone"` on the phone's Settings page, next to `place`. A section no longer guesses from the width.

- `shell.settings-list-page` gets the sentence about `surface` and one example.
- `settings.appearance-section`: on the phone's page it has only Theme and Agent characters, and a failed save is a toast, "Couldn't save the theme on this phone.", with what the setting is back to, not a line under the control.
- `settings.formats-section`: on the phone's page the first option reads "Follow this phone: …", the choice opens the picker sheet with its search, and a failed save is the same toast.

"This phone" is said only in the served Studio. A narrow desktop app window has the phone layout too, and keeps "this computer".

## Covers

- shell.settings-list-page
- settings.appearance-section
- settings.formats-section
