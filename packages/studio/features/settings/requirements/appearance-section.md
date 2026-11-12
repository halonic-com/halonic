# settings.appearance-section

- Status: active
- Since: 0.1.0
- Source: HAL-1294 (T11); flow-settings 5 (HAL-646); g5-frames T11-F13 to F15 (HAL-1143); ux-checklists-t4-t5-t11 3.7 and 3.9 (HAL-1185); microcopy 13.1 and 19.8 (HAL-751)

The Settings dialog shall have an Appearance section, saved on this computer for every workspace, with these controls in this order: Theme, a select of System, Light and Dark; Frame colours, a select of "Blue and purple", "Green and blue", "Yellow and orange", "Pink and violet" and "Your own"; Panel opacity, a slider from 10% to 100% in steps of 10% with the hint "How much of the frame shows through the sidebar, the page and the tabs."; and Agent characters, a switch with the sentence "Show agents as orbs. Off shows initials." Each change shall apply at once and save by itself. While the slider is dragged the window shall follow it, and it shall save when it is let go. When a save fails, the control shall show the value from before, the line "Couldn't save the theme on this computer." (with the setting's own name) shall show under it until it next saves, and the dialog shall say the line and what the setting is back to, never in a toast.

## Examples

- Given nothing is stored,
  when Appearance shows,
  then Theme is System, Panel opacity is 80% and Agent characters is on.
- Given the panel opacity is 80%,
  when the user drags the slider to 50% and hasn't let go,
  then the window shows 50% and nothing is stored yet.
- Given storing fails,
  when the user picks Dark,
  then Theme shows System, "Couldn't save the theme on this computer." shows under it, and the dialog says "Couldn't save the theme on this computer. Theme is back to System."
