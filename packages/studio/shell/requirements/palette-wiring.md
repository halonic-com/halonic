# shell.palette-wiring

- Status: active
- Since: 0.1.0
- Source: HAL-1290 (T2); component specs 24.3 (HAL-175); UX checklist part 1, 1.7 (HAL-1323); design-search 2; microcopy 3.5 and 22 F13

When the user presses Mod K outside a modal dialog, on any keyboard layout, the shell shall open the Ctrl K palette with an empty search row. The palette shall list the open tabs' places and the places opened lately in the workspace, latest first, each once and with its current name, also when the tab that showed a place was closed before the place was renamed. When the words change, the palette shall ask the search providers again, use only the answer to the latest words, keep showing what was found for earlier words while it waits, and ask again on Try again. When the user opens a place or an item here, the palette shall close and the active tab shall show it, or the tab that already shows it shall become active. When the user opens one in a new tab, the palette shall stay open and say "Opened _name_ in a new tab." When the user picks an action, the palette shall close and run the command with its feature's context, and if the command fails, the shell shall show a danger toast "Couldn't run _title_." with the reason.

## Examples

- Given the user opened Agents and then Support reply in the active tab,
  when the palette opens with nothing typed,
  then Support reply shows under Open tabs, and Agents and Home under Recent.
- Given the user typed "re" and then "ref" before the providers answered "re",
  when the answer for "re" arrives,
  then it is dropped and the palette keeps searching for "ref".
- Given the user Ctrl-clicks "Refund checker", which no tab shows,
  when the click ends,
  then it opens in a new tab next to the active one, the palette stays open and "Opened Refund checker in a new tab." is said.
- Given the action "New agent" throws when it runs,
  when the user picks it,
  then the palette closes and a danger toast says "Couldn't run New agent."
