# shell.places-drawer

- Status: active
- Since: 0.1.0
- Source: HAL-1290 (T2); component specs 24.4 S4 (HAL-175); UX checklist part 1, 1.11 (HAL-1323); visual review kit T2-F43 to F47 (HAL-3078); HAL-965 (A7)

Where the desktop window is narrow, 600 to 899px wide, and has a sidebar, the frame shall fold the sidebar into a Places button at the toolbar's left: a ghost icon button with the menu icon, named "Places", with `aria-expanded`. When the button is pressed, the frame shall show the same sidebar as a 264px drawer from the left, under the toolbar and above the status bar, on `surface-subtle` with `shadow-3`, with the `--stack-scrim` over the page beside it only, the page inert, and the button on `surface-muted`; with no close button and no slide. When the drawer opens, the frame shall move focus to the current place's item, or the first place when none is current. The drawer shall be a `drawer` layer in the close stack. When a place is picked, the frame shall close the drawer and leave the focus where the pick put it. When Esc is pressed, the scrim is clicked or the Places button is pressed again, the frame shall close the drawer and move focus back to the button. When focus moves on to something outside the drawer, the frame shall close it and leave the focus there. When the window widens to 900px or more, the frame shall dock the sidebar again without remounting it, and the next narrow window shall start with the drawer closed. The sidebar's resize edge shall not show in a narrow window.

## Examples

- Given a window 800px wide with Home as the current place,
  when the user presses Places,
  then the sidebar opens as the drawer, the page is inert under the scrim, and focus is on Home.
- Given the drawer is open,
  when the user presses Esc,
  then the drawer closes and focus is back on Places.
- Given the drawer is open,
  when the user picks Runs,
  then the drawer closes, Runs opens, and focus is on its `h1`.
- Given the drawer is open with "ru" typed in the sidebar,
  when the window widens to 1440px,
  then the sidebar is docked beside the page with "ru" still typed, and there's no Places button.
- Given a window 800px wide,
  when the sidebar renders,
  then its resize edge isn't there.
