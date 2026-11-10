# shell.home-sections

- Status: active
- Since: 0.1.0
- Source: HAL-1290 (T2, PR 8); design direction 3 (HAL-49); UX checklist part 1, 1.9 (HAL-1323)

The shell shall let a feature add a section to Home only through the point `home.addCard`, naming one of Home's sections: Get set up, Needs you, Recent runs. The shell shall show Home with the `h1` "Home", then the sections features added in that order, whatever order the features registered in, and shall leave out a section no feature added. The shell shall give each section its heading from its own table, not from the feature, and shall show each section as a region named by its heading, drawn by the card's view with the context of the feature that added it. If a feature adds a section that isn't one of these, or two features add the same section, then the shell shall throw a `ShellError` that names the feature or features.

## Examples

- Given _runs_ adds Recent runs and _inbox_ adds Needs you, registered in that order,
  when Home is shown,
  then its sections read Needs you, Recent runs.
- Given no feature adds a card,
  when Home is shown,
  then it shows only the `h1` "Home".
- Given a feature adds the section "news",
  when the shell is created,
  then a `ShellError` names the feature and lists Home's sections.
- Given _inbox_ and _approvals_ both add Needs you,
  when the shell is created,
  then a `ShellError` names both and says each section belongs to one feature.
