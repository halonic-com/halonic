# shell.settings-list-page

- Status: active
- Since: 0.1.0
- Source: HAL-7859, HAL-7860 and HAL-7919 (HAL-7832 parts 1 to 3); UX finding S2 on #2175; flow-settings 13; UX checklist T11 3.23

Where the Studio window shows the phone layout, Settings shall open as a page on the More stack, not as a dialog, from the Settings row at the end of the More page and from the window's `openSettings`. The page shall list the sections the window has, under the headings "Acme · workspace settings" (only with a workspace open), "On this phone" and "On your computer", each as a 56px row with an icon, the section's name, its one-line summary when it has one, and a chevron, never listing a section with `phone: false` such as Developer, and shall have an `h1` "Settings" for screen readers. When a section's row is tapped, the shell shall open that section as the next page on the stack, with its name as the top bar's title, and **Back** shall return one page at a time, to the Settings list and then to the More page. Back from a section shall return to the list scrolled where it was. A section that is not listed shall not open from `openSettings(id)` either. Where the window gives no `openSettings`, the More page shall show no Settings row. The shell shall tell each section's view that it is drawn on the phone's page (`surface: "phone"`, where the Settings dialog says `"window"`), so a section changes its look for the phone from what the shell says, never from the width.

## Examples

- Given the sections Appearance, Formats and Assistant,
  when the user taps More, then Settings,
  then the page lists Appearance, Formats and Assistant, each with a chevron, under the top bar "Settings".
- Given the window gives `openSettings`,
  when the More page renders,
  then Settings is the last row, with its icon and a chevron.
- Given the window gives no `openSettings`,
  when the More page renders,
  then it shows no Settings row.
- Given the Settings page,
  when the user taps Formats,
  then the page is Formats' view under the top bar "Formats", with no bottom navigation.
- Given the Formats page,
  when the user taps **Back** twice,
  then the page is the Settings list, then the More page.
- Given a view that calls `openSettings("assistant")` on a phone,
  when it runs,
  then the Assistant section's page is open, and **Back** goes to the Settings list.
- Given Appearance with the summary "System theme · characters on" and a Developer section with `phone: false`,
  when the Settings list renders with the workspace Acme open,
  then the headings are "Acme · workspace settings", "On this phone" and "On your computer",
  the Appearance row reads "Appearance, System theme · characters on", and Developer is not listed.
- Given a list scrolled down and a section opened from it,
  when the user taps **Back**,
  then the list is scrolled where it was.
- Given a section opened from the Settings list on a phone,
  when its view is drawn,
  then it is told its surface is "phone"; in the Settings dialog of a window it is told "window".
