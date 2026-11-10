# shell.engine-line

- Status: active
- Since: 0.1.0
- Source: HAL-1290 (T2); microcopy 2 (HAL-751); state coverage D1 (HAL-2160); visual review kit T2-F30 (HAL-1115); UX checklist part 1, 1.5 (HAL-1323)

While the engine is stale, the frame shall show one line over the sidebar and the page, under the toolbar on the desktop and at the top on a phone, reading the stale text for where the Studio runs, such as "The engine isn't answering. Showing what it said last.", with the info mark. The line shall not be a live region, because the engine announces the change once. When the engine answers again, the line shall go.

## Examples

- Given a desktop Studio whose engine was answering,
  when the connection is lost,
  then one line under the toolbar reads "The engine isn't answering. Showing what it said last.".
- Given the same line,
  when the engine answers again,
  then the line is gone.
- Given an engine that never answered,
  when the frame renders,
  then there is no line.
