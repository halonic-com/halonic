# shell.studio-phone

- Status: active
- Since: 0.1.0
- Source: HAL-1290 (T2), plan PR 16c; component specs 15.1 and 15.2 (HAL-175); phone layout 2 (HAL-330); UX checklist part 1, 1.13 and 1.14 (HAL-1323)

Where the Studio window shows the phone layout, it shall show the phone's top bar, the page of the phone place the user is in and, on a place or a list, the bottom navigation, with the window tabs, the toolbar, the sidebar and the status bar left out. The top bar shall show the page's title, **Back** under the top of a place, and **Search** at the top of a place, which opens the Search sheet; a pick from the sheet shall open on the phone. The bottom navigation shall show Home, Inbox and Runs where features added them, then More, each with its signal read through the context of the feature that added it. The page shall be Home, the view of a place a feature added given that feature's context, or the More page at the top of More, each held as a desktop tab's page is: a page that stops working shall show "This page stopped working", with the top bar and the bottom navigation still working. The More page shall list the places features added under More and show the workspace switcher row only once the app gives it a workspace picker. Android's back shall go through the shell (`shell.phone-back`). The Ctrl K palette shall not show in the phone layout, and shall not stay open there, so it doesn't show when the window widens again. When the window crosses the phone width, each layout shall come back to where it was: the desktop to its tabs, the phone to its place.

## Examples

- Given a new workspace in the phone layout,
  when the window shows,
  then it shows the top bar "Home" with **Search**, the page "Home" and the bottom navigation with Home current, and no window tabs.
- Given _inbox_ adds the Inbox,
  when the user taps Inbox in the bottom navigation,
  then the page is the Inbox's view, with the context of _inbox_, under the top bar "Inbox".
- Given _agents_ adds Agents,
  when the user taps More, then Agents,
  then the page is the Agents view with **Back**, and **Back** goes back to the More page.
- Given the top of a place,
  when the user taps **Search**,
  then the Search sheet opens.
- Given the Inbox on the phone,
  when Android's back is pressed,
  then the phone shows Home.
- Given a tab on the Inbox on the desktop, and the phone on More,
  when the window narrows to the phone width and widens again,
  then the phone shows More and the desktop's tab still shows the Inbox.
- Given _agents_ adds Agents, whose view throws,
  when the user taps More, then Agents,
  then the page shows "This page stopped working" under the top bar "Agents", the bottom navigation still shows, and tapping Home shows Home.
- Given the desktop layout with the Ctrl K palette open,
  when the window narrows to the phone width and widens again,
  then the palette is closed.
