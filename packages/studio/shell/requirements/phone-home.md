# shell.phone-home

- Status: active
- Since: 0.1.0
- Source: HAL-1290 (T2, PR 15b); phone layout 2.1 and 2.6 (HAL-330); UX checklist part 1, 1.15 (HAL-1323); visual review kit T2-F12 (HAL-1115)

Where the Studio shows the phone layout, Home shall have its `h1` "Home" for screen readers only, since the top bar shows the word, and shall show its sections edge to edge, 8px apart, with no dividers between them. While a section loads on a phone, the shell shall show two skeleton rows flush with the screen's edges, in place of the three bordered rows on the desktop.

## Examples

- Given the phone layout,
  when Home renders,
  then its `h1` "Home" is for screen readers only and can take the focus.
- Given the phone layout and Recent runs loading,
  when 300 ms have passed,
  then Recent runs shows two skeleton rows with no border round them.
