# inbox.project-dot

- Status: active
- Since: unreleased
- Source: the board's approval of the HAL-19192 sketches (question 4, projects that fit; sketches B, D and E), task HAL-19492; five colours, not the brief's six, after the design check on HAL-20307; four, without the rose of "failed", after the design check on HAL-20370; the board-approved HAL-19192 sketches as Sofia's design check on HAL-20395 read them (task HAL-20396)

When an agent's item belongs to a project, the Inbox shall start its row's line with a dot in the project's colour and the project's name, cut with "…" when it is long, then who asks, and shall show the whole name on hover, in the open item's header and to screen readers. The row's line shall not name the source; the open item's header does. The dot's colour shall be one of three fixed colours, picked from the project's ID, so a project keeps its colour in every list; none of them shall be the violet of what waits for you, the amber of late, the azure of a running agent, the rose of failed or the blue of an unread row. An item with no project shall have no dot.

## Examples

- Given a question from Chief in the project Studio app,
  when the Inbox lists it,
  then its row's line reads "Studio app · Chief", led by the project's dot, with "2 min" at the row's top right.
- Given that question, open,
  when its header shows,
  then its line starts with the dot and the whole name "Studio app", and reads "Studio app · Paperclip · Acme · Chief · Waiting 2 min".
- Given two items in the same project, from different agents,
  when the Inbox lists them,
  then both dots have the same colour.
- Given an item with no project,
  when the Inbox lists it,
  then its line has no dot.
