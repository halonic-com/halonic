# shell.phone-search-button

- Status: active
- Since: 0.1.0
- Source: HAL-1290 (T2), plan PR 15c; component specs 15.1 and 24.3 "On a phone" (HAL-175); UX checklist part 1, 1.14 (HAL-1323); visual review kit T2-F11 (HAL-1115)

The phone top bar's Search, `PhoneSearchButton`, shall be a 48px icon button named "Search". When the user presses it, the button shall take the focus, even where a tap doesn't focus a button, and the shell shall open the phone's Search sheet (`shell.phone-search`). When the sheet closes, by Close, Android back or a pick, the shell shall remove the sheet and put the focus back on the button, before a picked place or item opens.

## Examples

- Given the top bar at the top of Inbox with the Search button,
  when the user taps "Search",
  then the Search sheet opens with the focus in its field.
- Given the Search sheet open from the button,
  when the user presses Close,
  then the sheet is gone and the focus is on "Search".
- Given the Search sheet open from the button and the place Runs in Recent,
  when the user taps "Runs",
  then the sheet is gone, the focus was back on "Search", and then the phone opens Runs.
