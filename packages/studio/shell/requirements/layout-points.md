# shell.layout-points

- Status: active
- Since: 0.1.0
- Source: HAL-171; plan 5.3

A feature shall add item kinds, explorer entries and item page sections only through the named points `itemKinds.add`, `explorer.addGroup`, `explorer.addSection` and `itemPage.addSection`. The shell shall list each point's ordered contributions by `order`, lowest first, then by `id`, list item kinds in the order they were added, and record which feature added each one. Ids and kinds shall be names of letters, digits and dashes, starting with a letter, joined by dots, and each contribution shall be a plain object (an object literal), because the shell keeps a copy and a copy of an object made from a class would lose its methods. If two item kinds share a kind, two contributions to a point share an id (per item kind for item page sections, across groups and sections for the explorer), an item page section names a kind no feature adds, an id or kind isn't a valid name, a contribution isn't a plain object, or a feature adds after its `register` returned, then the shell shall throw a `ShellError` that names the features involved.

## Examples

- Given explorer groups `runs` (order 20), `pinned` (order 10) and `agents` (order 10),
  when the explorer groups are listed,
  then the order is `agents`, `pinned`, `runs`.
- Given _agents_ and _runs_ both add the explorer group `agents`,
  when the shell is created,
  then a `ShellError` naming both features is thrown.
- Given a section `triggers` on the `agent` page and another `triggers` on the `workflow` page,
  when the shell is created,
  then both are accepted.
- Given a section on the page of `robot` and no feature adds the kind `robot`,
  when the shell is created,
  then a `ShellError` naming `robot` is thrown.
