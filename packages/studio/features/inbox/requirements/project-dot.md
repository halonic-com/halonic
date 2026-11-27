# inbox.project-dot

- Status: active
- Since: unreleased
- Source: the board's approval of the HAL-19192 sketches (question 4, projects that fit; sketches B, D and E), task HAL-19492; five colours, not the brief's six, after the design check on HAL-20307

When an agent's item belongs to a project, the Inbox shall start its row's line with a dot in the project's colour and the project's name, cut with "…" when it is long, and shall show the whole name on hover, in the open item's header and to screen readers. The dot's colour shall be one of five fixed colours, picked from the project's ID, so a project keeps its colour in every list; none of them shall be the violet of what waits for you, the amber of late or the azure of a running agent. An item with no project shall have no dot.

## Examples

- Given a question from Chief in the project Studio app,
  when the Inbox lists it,
  then its row's line reads "Studio app · Paperclip · Acme · Chief · Waiting 2 min", led by the project's dot.
- Given that question, open,
  when its header shows,
  then its line starts with the dot and the whole name "Studio app".
- Given two items in the same project, from different agents,
  when the Inbox lists them,
  then both dots have the same colour.
- Given an item with no project,
  when the Inbox lists it,
  then its line has no dot.
