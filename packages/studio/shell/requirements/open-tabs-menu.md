# shell.open-tabs-menu

- Status: active
- Since: 0.1.0
- Source: HAL-1290 (T2); component specs 24.5 T5 and 20.1 (HAL-175); UX checklist part 1, 1.11 (HAL-1323); visual review kit T2-F43 to F45 (HAL-3078)

Where the desktop window is narrow, 600 to 899px wide, the window tab strip shall fold the tabs into one button in the header badge's look with no leading icon, reading "3 open tabs" (or "1 open tab") followed by a ▾, and keep **+** after it. While any open tab needs you, the button shall show the still 6px `warning` dot before the ▾ and be named with the count after the words, "3 open tabs, 1 needs you". When the button is pressed, the shell shall open a kit Menu of the open tabs in their order, from the button's left edge, each with its icon and title, the active one checked and each one that needs you with the `warning` dot and "needs you" in its name. When a tab is picked, the shell shall make it active. When the window widens to 900px or more, the strip shall show the tabs again.

## Examples

- Given a window 800px wide with tabs "Agents", "Sorter" and "Support reply",
  when the strip renders,
  then there's no `tablist`, a button reads "3 open tabs" and opens a menu, and **+** follows it.
- Given "Support reply" needs you,
  when the strip renders,
  then the button is named "3 open tabs, 1 needs you" and shows the `warning` dot, and the menu item reads "Support reply, needs you".
- Given the menu with "Sorter" checked,
  when the user picks "Support reply",
  then "Support reply" is the active tab.
- Given a window 800px wide with one tab,
  when the strip renders,
  then the button reads "1 open tab".
- Given a window 800px wide,
  when it widens to 1440px,
  then the strip shows the three tabs again.
