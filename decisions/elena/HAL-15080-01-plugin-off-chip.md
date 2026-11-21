# Decision: the Plugins list says a plugin is off on this computer, and view only names the desktop app

- Task: HAL-15080
- Approval: https://paperclip.halonic.com/HAL/issues/HAL-15080 (found in check C540 #2 on HAL-15074; a chip and a line in the words of R13, which the board approved on HAL-1949, so a team decision under the HAL-2282 rule; Sofia confirms the words on the task; Liam's code review signs this note)
- Kind: user-visible

## What changes

- `plugins.plugin-list`: a plugin that is on and has a backend, while the host says plugin code doesn't run in the sandbox here and no yes for that reason is saved, gets the `warning` chip "Off on this computer". The list asks the host once for all its plugins, and again when those plugins or their trust change. It asks nothing when no listed plugin that is on has a backend.
- `plugins.plugin-page-needs-yes`: where the page is view only, R13 ends with "Allow this in the Halonic desktop app." in place of "Allow this on your computer.".

## Why

Since #4448 the plugin's page says "*Acme orders* is off on this computer until you allow plugins and integrations to run without the sandbox.", but its row in the list had no chip, so it looked on. The chip uses R13's own state words, and the page and the list now share one test (`isOffHere`), so they can't disagree.

"Allow this on your computer." is also what a served browser on that same computer shows, so it didn't say where. The yes can only be given in the desktop app.

## Decided by the team

- C540 also reported that **Trust** without the box toasts "*name* is on". In today's code **Trust** stays unavailable until the box is ticked whenever a plugin with a backend needs the yes (`useUnfencedYes`, `needsUnfencedYes`), so that toast can't follow; no change.
- The CLI's half of C540 #2 (`plugin add`, `trust --plugin`, `plugin list`) is a separate pull request on HAL-15080.

## Covers

- plugins.plugin-list
- plugins.plugin-page-needs-yes
