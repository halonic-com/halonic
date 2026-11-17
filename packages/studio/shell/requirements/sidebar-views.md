# shell.sidebar-views

- Status: active
- Since: unreleased
- Source: HAL-1293 (T5, Files tree); plan HAL-10534, review HAL-10535; flow-files 3.1

The shell shall let a feature add a view to the sidebar through the point `sidebarViews.add`, so the sidebar can switch between the Studio's places and that view without the shell knowing what the view shows. The shell shall list the views by `order`, lowest first, then by `id`, record which feature added each one, and list none while no feature adds one. If two views share an id, an id isn't a valid name, a view isn't a plain object or has no label, or a feature adds one after its `register` returned, then the shell shall throw a `ShellError` that names the feature.

## Examples

- Given the feature `files` adds the view `files` (order 10, label "Files") and the feature `notes` adds `notes` (order 5, label "Notes"),
  when the sidebar's views are listed,
  then they read `notes`, `files`, each with the feature that added it.
- Given no feature adds a view, then the list is empty.
- Given a view with the label "  ", then creating the shell throws a `ShellError` that names the feature and the view.
- Given two features add a view with the id `files`, then creating the shell throws a `ShellError` that names both.
