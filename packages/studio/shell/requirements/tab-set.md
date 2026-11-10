# shell.tab-set

- Status: active
- Since: 0.1.0
- Source: HAL-1290 (T2); design direction 2 (HAL-49); UX checklist part 1, 1.2 (HAL-1323)

The shell shall keep the window tabs of a workspace in a `TabSet`, which always holds at least one tab and exactly one active tab. Each tab shall keep its own history of places, with Back and Forward; Back and Forward shall skip places another tab shows now, and do nothing when no other place is left. When a place is opened here, the shell shall show it in the active tab after the current place and drop that tab's Forward places. When a place is opened in a new tab, the shell shall add the tab right after the active one and keep the active tab. If another tab already shows the place being opened, here or in a new tab, then the shell shall make that tab active (here) or leave the tabs as they are (new tab), instead of opening a copy; Home is the one place several tabs may show. A new tab shall start on Home at the end of the strip and become active. When the active tab closes, the shell shall make the tab to its right active, or else the one to its left; when the last tab closes, the shell shall leave one tab on Home. The shell shall bring back the last closed tab, with its history, in its old place, for the last 20 closed tabs. The shell shall move a tab to any place in the strip, activate the next or previous tab with wrap-around, and activate the tab at a position, where the last position stands for the last tab. When a place is renamed, every tab that shows it or has it in its history, closed tabs included, shall show the new title.

## Examples

- Given one tab on Home,
  when "Agents" and then "Sorter" are opened here,
  then the tab shows "Sorter"; Back shows "Agents", Forward "Sorter" again.
- Given tab 1 on "Sorter" with "Agents" behind it,
  when the user goes Back and opens "Workflows" here,
  then the tab shows "Workflows" and Forward does nothing.
- Given tab 1 on "Sorter" with "Home" and "Agents" behind it, and tab 2 on "Agents",
  when the user goes Back in tab 1,
  then tab 1 shows "Home" and stays active; Back again does nothing.
- Given tab 1 on "Agents" and tab 2 on "Support reply", with tab 1 active,
  when "Support reply" is opened here,
  then tab 2 becomes active and no tab is added.
- Given tabs "Agents", "Sorter", "Writer" with "Sorter" active,
  when "Sorter" closes,
  then the strip reads "Agents", "Writer" with "Writer" active; Ctrl Shift T brings "Sorter" back between them, active.
- Given one tab on "Sorter",
  when it closes,
  then one tab on Home remains.
- Given tabs "Agents", "Sorter", "Writer" with "Writer" active,
  when the next tab is activated,
  then "Agents" becomes active.
- Given a tab on "Mail triage" and another with "Mail triage" behind it,
  when "Mail triage" is renamed "Triage",
  then both tabs show "Triage" for it.
- Given a closed tab on "Mail triage",
  when "Mail triage" is renamed "Triage" and Ctrl Shift T brings the tab back,
  then it shows "Triage".
