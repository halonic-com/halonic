# shell.sidebar-places

- Status: active
- Since: 0.1.0
- Source: HAL-1290 (T2); component specs 24.4 S2 and S3 (HAL-175); UX checklist part 1, 1.3 (HAL-1323), settled in 1.D S-D10

The shell shall let a feature add a sidebar place only through the point `places.add`, naming one of the sidebar's places: Home, Inbox, Agents, Workflows, Routines, Library, Runs, Changes. The shell shall list the places features added in that order, whatever order the features registered in, and shall leave out a place no feature added, so the order stays the same as places arrive. The shell shall give each place its name and icon from its own table, not from the feature, and shall show and speak a place's signal only when its value is above zero. If a feature adds a place that isn't one of these, or two features add the same place, then the shell shall throw a `ShellError` that names the feature or features.

## Examples

- Given _runs_ adds Runs and _agents_ adds Agents, registered in that order,
  when the sidebar's places are listed,
  then they read Agents, Runs.
- Given only Home is added,
  when the places are listed,
  then they read Home.
- Given the Inbox's signal is a count of 0,
  when the sidebar shows the Inbox,
  then it shows no count and a screen reader hears only "Inbox".
- Given a feature adds the place "dashboards",
  when the shell is created,
  then a `ShellError` names the feature and lists the sidebar's places.
- Given _agents_ and _crew_ both add Agents,
  when the shell is created,
  then a `ShellError` names both and says each place belongs to one feature.
