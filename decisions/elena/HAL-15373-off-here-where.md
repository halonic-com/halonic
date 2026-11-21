# Decision: off on this computer says where the yes is given, an open plugin page follows Take back, and the CLI warns before it asks

- Task: HAL-15373, from flow check C565 rows 2, 3 and 5 (HAL-15351)
- Approval: https://paperclip.halonic.com/HAL/issues/HAL-15373 (builds on R13 and R16, which the board approved on HAL-1949, so the words are a team decision under the HAL-2282 rule; Sofia checks the words on the task; Liam's code review signs this note)
- Kind: user-visible

## What changes

- New `settings.unfenced-yes-where`: while Settings › Agent sandbox › **Plugins and integrations** needs a yes that isn't saved, it says "You give it with Review on a plugin's page in Plugins." with **Open Plugins**, which opens Settings › Plugins. After a Take back the block reads the status again and goes to that state, so the place shows right under the toast's "until you allow it again".
- New `plugins.off-here-follows-yes`: an open plugin page and the Plugins list read the host's status again whenever the window's yes changes, so after a Take back the open page shows R13's Callout as the list shows "Off on this computer" (#4491's `isOffHere` promise).
- `studio.desktop-unfenced-runs` (edited): the window's one yes object tells its subscribers after a Take back ends, refused or not, and after a yes is saved. Nothing else in it changes; its existing tests still run.
- `cli.commands.plugin.off-here` (edited): the third line names the place, "Or allow this in the Halonic desktop app: Settings › Plugins › *Name* › Review. The halonic command runs plugin code only in the sandbox.", and `plugin add` and `trust --plugin` say "! Trusting *Name* won't turn it on here: it stays off on this computer until you allow plugins and integrations to run without the sandbox." with the reason and the place before they ask "Trust *Name* and turn it on?". The tests that checked the old third line check the new one; none is weakened.
- `docs/guides/plugins.md`: the "off on this computer" row names **Settings › Plugins**, the plugin, then **Review**.

## Why

In a container, `halonic trust --plugin acme-orders` and the guide sent people to "the Halonic desktop app", and Studio's Plugins and integrations block said "it needs your yes" with no button and no pointer: the yes is only given in a plugin's Review. An open plugin page kept "✓ On" after a Take back until it was closed and opened again, while the list said off. And `plugin add` asked "Trust … and turn it on?" and only after the yes said it was off here, while Studio's trust check says so up front.

## Decided by the team

- The block names the place in a line and links to the Plugins list, not to one plugin: the yes covers every plugin, so any plugin's Review gives it.
- The Take back toast keeps its words: the block it sits under now names the place right after the Take back.
- The CLI warning goes right above the question, after the check and its fingerprint, so it is the last thing read before answering. The question keeps its approved words.
- The page and the list subscribe to the window's yes rather than poll: the change only ever happens in this window, through that object.

## Covers

- cli.commands.plugin.off-here
- studio.desktop-unfenced-runs
