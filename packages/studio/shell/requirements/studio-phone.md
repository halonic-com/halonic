# shell.studio-phone

- Status: active
- Since: unreleased
- Source: HAL-1290 (T2), plan PR 16c; HAL-12860; component specs 15.1 and 15.2 (HAL-175); phone layout 2 (HAL-330); UX checklist part 1, 1.13 and 1.14 (HAL-1323); the team's fallback for a window that crosses the phone width (HAL-13726)

Where the Studio window shows the phone layout, it shall show the phone's top bar, the page of the phone place the user is in and, on a place or a list, the bottom navigation, with the window tabs, the sidebar and the status bar left out. The top bar shall show the page's title, **Back** under the top of a place, and **Search** at the top of a place, which opens the Search sheet; a pick from the sheet shall open on the phone. The bottom navigation shall show Home, Inbox and Runs where features added them, then More, each with its signal read through the context of the feature that added it. The page shall be Home, the view of a place a feature added given that feature's context, or the More page at the top of More, each held as a desktop tab's page is: a page that stops working shall show "This page stopped working", with the top bar and the bottom navigation still working. A place's view shall be able to push a list above its page (`openPlaceList`, key `place/sub`, the view given `sub`): its title is the one the view gave, **Back** leads to the place's page and the bottom navigation stays; pushing another list of the same place from it replaces the list, it doesn't stack on it. A place's view shall also be able to push a page that is not a list above its page (`openPlacePage`, key `place/sub`, the view given `sub`): its title is the one the view gave, the bottom navigation hides, and **Back** leads to the page it was pushed from. The view shall be able to close that page as **Back** does (`closePlacePage`), and closing it shall move nothing once the user has left it. A page the phone shows for the first time shall start at its top. When **Back** returns to a page, the page shall be scrolled where the user left it, and a place's view shall get the page's memory (`memory`), with the row the view noted there before it pushed a page. The More page shall list the places features added under More and show the workspace switcher row only once the app gives it a workspace picker. Android's back shall go through the shell (`shell.phone-back`). The Ctrl K palette shall not show in the phone layout, and shall not stay open there, so it doesn't show when the window widens again. When the window crosses the phone width, either way, the page that's open shall stay open in the new layout, with the focus on its title: narrowed, the phone shall show the active tab's page where it lives, so **Back** leads to the place that lists it (or Home); widened, the active tab shall show the phone's page, or the tab that already shows it shall become active. A page with no version in the new layout shall open its parent instead: a list or a page a place pushed opens the place, and Settings' list or a section opens the Settings dialog on it. The More page has none on the desktop, whose sidebar does its work, so the desktop keeps the tab it had.

## Examples

- Given a place's view on a phone,
  when it pushes a list named "Daily",
  then the top bar says "Daily", the view draws that list, the bottom navigation shows, and **Back** returns to the place's page.
- Given a place's view on a phone,
  when it pushes a page named "Reply writer",
  then the top bar says "Reply writer", the view draws that page, the bottom navigation hides, and **Back** returns to the place's page.
- Given a page a place's view pushed,
  when the view closes it,
  then the place's page shows; and when the user has gone Back already, closing it moves nothing.
- Given a place's page scrolled 300px down, whose view noted a row and pushed a page,
  when **Back** returns to it,
  then it is 300px down and its view gets the row it noted.
- Given a short window, where the whole phone column scrolls, with a place's page scrolled 300px down,
  when its view pushes a page,
  then the pushed page shows from its top with the top bar; and when **Back** returns, the place's page is 300px down.
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
- Given run "#43" open in a desktop tab, and _runs_ names Runs as the place that lists runs,
  when the window narrows to the phone width,
  then the phone shows run "#43" with the focus on its title, and **Back** goes to Runs.
- Given the Inbox open on the phone,
  when the window widens to the desktop width,
  then the active tab shows the Inbox, with the focus on its title.
- Given a list "Daily" that Routines pushed on the phone,
  when the window widens to the desktop width,
  then the active tab shows Routines.
- Given Settings' Appearance open on the phone,
  when the window widens to the desktop width,
  then the Settings dialog opens on Appearance.
- Given a tab on the Inbox on the desktop, and the phone on More,
  when the window widens again,
  then the desktop's tab still shows the Inbox.
- Given _agents_ adds Agents, whose view throws,
  when the user taps More, then Agents,
  then the page shows "This page stopped working" under the top bar "Agents", the bottom navigation still shows, and tapping Home shows Home.
- Given the desktop layout with the Ctrl K palette open,
  when the window narrows to the phone width and widens again,
  then the palette is closed.
