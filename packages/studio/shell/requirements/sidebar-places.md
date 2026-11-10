# shell.sidebar-places

- Status: active
- Since: 0.1.0
- Source: HAL-1290 (T2); component specs 24.4 S2 and S3 (HAL-175); UX checklist part 1, 1.3 (HAL-1323), settled in 1.D S-D10; Home from the shell (HAL-3034, HAL-3063 item 6)

The shell shall add the Home place itself, before any feature registers. The shell shall let a feature add any other sidebar place only through the point `places.add`, naming one of the sidebar's places: Home, Inbox, Agents, Workflows, Routines, Library, Runs, Changes. The shell shall list Home and the places features added in that order, whatever order the features registered in, and shall leave out a place no feature added, so the order stays the same as places arrive. The shell shall give each place its name and icon from its own table, not from the feature, and shall show and speak a place's signal only when its value is above zero. If a feature adds a place that isn't one of these, adds Home, or two features add the same place, then the shell shall throw a `ShellError` that names the feature or features.

## Examples

- Given _runs_ adds Runs and _agents_ adds Agents, registered in that order,
  when the sidebar's places are listed,
  then they read Home, Agents, Runs.
- Given no feature adds a place,
  when the places are listed,
  then they read Home, added by the shell.
- Given a feature adds Home,
  when the shell is created,
  then a `ShellError` names the feature and says the shell adds Home itself.
- Given the Inbox's signal is a count of 0,
  when the sidebar shows the Inbox,
  then it shows no count and a screen reader hears only "Inbox".
- Given a feature adds the place "dashboards",
  when the shell is created,
  then a `ShellError` names the feature and lists the sidebar's places.
- Given _agents_ and _crew_ both add Agents,
  when the shell is created,
  then a `ShellError` names both and says each place belongs to one feature.
