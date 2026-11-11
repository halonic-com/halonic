# shell.phone-bars

- Status: active
- Since: 0.1.0
- Source: HAL-1290 (T2); component specs 0.2, 15.1 and 15.2 (HAL-175); phone layout (HAL-330); visual review kit T2-F11, F13 and F14 (HAL-1115)

While the window is narrower than `PHONE_MAX_WIDTH`, the frame shall show the phone's top bar above the page and, while it is given one, the bottom navigation below the page, with the engine's line between the top bar and the page.

The top bar, `PhoneTopBar`, shall be at least 56px high plus the top safe area, with a line below it. Where it is given a way back, it shall show a 48px icon button named "Back" at its left, and none at the top of a place. It shall show its title on one line after that, left aligned, ending in "…" when the title doesn't fit, and its actions at the right.

The bottom navigation, `BottomNavigation`, shall be a `nav` named "Places", at least 56px high plus the bottom safe area, with a line above it. It shall show Home, Inbox and Runs where the features added them, then More, always, each sharing the width equally as a link with a 20px icon over its label. The place the user is in shall be `aria-current="page"`, with the filled icon on the halo pill; the others shall show the outline icon. Inbox shall show its count and Runs the still running dot at the icon's corner, and each link shall be named with the signal after the place's name, as the sidebar says it. When an item is tapped, the shell shall pass its place on.

## Examples

- Given a window 400px wide with a top bar "Inbox" and the bottom navigation,
  when the frame renders,
  then the top bar comes first, then the page in `main`, then the bottom navigation.
- Given the top bar "Support reply" with a way back,
  when it renders,
  then it shows a button named "Back" before the title, and pressing it goes back.
- Given the top bar "Inbox" at the top of a place,
  when it renders,
  then there's no Back button.
- Given the places Home, Inbox with 3 waiting, and Runs with 1 running, and the user in Inbox,
  when the bottom navigation renders,
  then it shows the links "Home", "Inbox, 3 waiting", "Runs, 1 running" and "More", in that order, and only "Inbox" is the current page with the filled icon.
- Given only Home added,
  when the bottom navigation renders,
  then it shows Home and More.
- Given the user in Inbox,
  when they tap Runs,
  then the shell is told "runs".
