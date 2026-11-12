# shell.settings-list-page

- Status: active
- Since: 0.1.0
- Source: HAL-7859 (HAL-7832 part 1); UX finding S2 on #2175; flow-settings 13; UX checklist T11 3.23

Where the Studio window shows the phone layout, Settings shall open as a page on the More stack, not as a dialog, from the Settings row at the end of the More page and from the window's `openSettings`. The page shall list the sections the window has, in the order the desktop's Settings lists them, each as a 56px row with a chevron, and shall have an `h1` "Settings" for screen readers. When a section's row is tapped, the shell shall open that section as the next page on the stack, with its name as the top bar's title, and **Back** shall return one page at a time, to the Settings list and then to the More page. Where the window gives no `openSettings`, the More page shall show no Settings row.

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
