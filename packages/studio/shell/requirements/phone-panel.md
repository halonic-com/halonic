# shell.phone-panel

- Status: active
- Since: unreleased
- Source: HAL-16810 (T14 PR 18); flow-assistant 11.1 and 11.3 (HAL-647); component specs 0.2, 15.1 and 15.3 (HAL-175); phone layout 6 (HAL-330)

Where the Studio window shows the phone layout and a feature added a panel window, the top bar at the top of a place shall show the panel's button after **Search**: a 48px icon button named by the panel's title, with the Assistant's 24px orb in the halo's two colours. When the user presses it, the button shall take the focus, even where a tap doesn't focus a button, and the window shall open the panel as a full page: its view in place of the top bar, the engine's line, the strips, the notice strip, the page and the bottom navigation. The page shall stay mounted under it and inert, so it comes back as it was. While the panel is open, Android's back shall close it wherever the focus is. When it closes, by its view's Back, Android's back or `panelWindow`, the window shall show the top bar, the page and the bottom navigation again and move the focus back to what had it before the panel opened, or to the button. Under the top of a place the top bar shall show no panel button.

## Examples

- Given the _assistant_ feature adds the panel window "Assistant", on a window 390px wide at the top of Home,
  then the top bar shows "Search", then the "Assistant" button with its orb.
- Given that window,
  when the user taps "Assistant",
  then the panel fills the window with no top bar and no bottom navigation, and the page "Home" is still there, inert.
- Given the panel open on a phone with the focus on the page's body,
  when Android's back is pressed,
  then the panel closes, the top bar and the bottom navigation show, and the focus is on the "Assistant" button.
- Given a page pushed above a place on a phone,
  then the top bar shows no "Assistant" button.
