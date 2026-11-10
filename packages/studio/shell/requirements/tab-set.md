# shell.tab-set

- Status: active
- Since: 0.1.0
- Source: HAL-1290 (T2); design direction 2 (HAL-49); UX checklist part 1, 1.2 (HAL-1323); UX decisions D1–D3 (HAL-3033, HAL-3071)

The shell shall keep the window tabs of a workspace in a `TabSet`, which always holds at least one tab and exactly one active tab. Each tab shall keep its own history of places, with Back and Forward; Back and Forward shall move exactly one place, even when another tab shows that place, and do nothing at either end of the history. The shell shall tell whether the active tab can go Back and whether it can go Forward. When the place the active tab shows is opened here, the shell shall leave everything as it is. When another place is opened here, the shell shall show it in the active tab after the current place and drop that tab's Forward places. When a place is opened in a new tab, the shell shall add the tab right after the active one and keep the active tab. If another tab already shows the place being opened, here or in a new tab, then the shell shall make that tab active (here) or leave the tabs as they are (new tab), instead of opening a copy, preferring the active tab when several tabs show it, and shall tell that no tab was added; Home is the one place several tabs may show. A new tab shall start on Home at the end of the strip and become active. When the active tab closes, the shell shall make the tab to its right active, or else the one to its left; when the last tab closes, the shell shall leave one tab on Home. The shell shall bring back the last closed tab, with its history, in its old place, for the last 20 closed tabs. The shell shall move a tab to any place in the strip, activate the next or previous tab with wrap-around, and activate the tab at a position, where the last position stands for the last tab. When a place is renamed, every tab that shows it or has it in its history, closed tabs included, shall show the new title.

## Examples

- Given one tab on Home,
  when "Agents" and then "Sorter" are opened here,
  then the tab shows "Sorter"; Back shows "Agents", Forward "Sorter" again.
- Given tab 1 on "Sorter" with "Agents" behind it,
  when the user goes Back and opens "Workflows" here,
  then the tab shows "Workflows" and Forward does nothing.
- Given tab 1 on "Sorter" with "Home" and "Agents" behind it, and tab 2 on "Agents",
  when the user goes Back in tab 1,
  then tab 1 shows "Agents" and stays active; Back again shows "Home".
- Given tab 1 on "Sorter" with "Home" behind it, and tab 2 on Home,
  when the user goes Back in tab 1,
  then tab 1 shows Home.
- Given one tab on Home,
  then Back and Forward are unavailable;
  when "Agents" is opened here, Back is available and Forward is not; after Back, Forward is available.
- Given one tab on "Agents" with Home behind it,
  when "Agents" is opened here,
  then nothing changes: Back shows Home, and Back again does nothing.
- Given tab 1 on "Agents" and tab 2 on "Support reply", with tab 1 active,
  when "Support reply" is opened here,
  then tab 2 becomes active and no tab is added.
- Given tab 1 on "Agents" and tab 2 on "Support reply", with tab 1 active,
  when "Support reply" is opened in a new tab,
  then no tab is added, tab 1 stays active, and the shell tells that tab 2 already shows it.
- Given tab 1 back on "Agents" while tab 2 also shows "Agents", with tab 1 active,
  when "Agents" is opened in a new tab,
  then no tab is added and the shell tells that tab 1 shows it.
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
