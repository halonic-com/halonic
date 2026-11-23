# Decision: the title bar ends with the side panel's button once a feature adds a panel window

- Approval: https://paperclip.halonic.com/HAL/issues/HAL-16788 (Liam approved the T14 pull request plan; PR 5 "updates `shell.title-bar` with a decision note")
- Kind: user-visible

`shell.title-bar` said "There shall be no Assistant button until the Assistant feature exists." T14 builds
the Assistant, so that sentence is replaced by what the button is: while a feature adds a panel window
(the new `shell.panel-window`), the title bar ends with that panel's button, ✦ and its title, a toggle
with `aria-expanded`, its title as the tooltip with the Kbd hint of its keys, and those keys in
`aria-keyshortcuts` (component specs 21.1, flow-assistant 5.8). With no panel window there is still no
button, so nothing changes on screen until the Assistant feature adds its panel (T14 PR 6). Two
examples are added for it; no example or test is removed or weakened.

## Covers

- shell.title-bar
