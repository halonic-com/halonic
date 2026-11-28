# studio-click-test.rail-current-step

- Status: active
- Since: unreleased
- Source: HAL-20944; Nora's review of #6912

When the click test runs the rail step, it shall close a Settings dialog left open, widen the window to 1280 × 800, require exactly one `nav` named "Apps" and one named "Places", click Home then Messenger on the rail, and pass once Messenger is `aria-current="true"` and no rail button is `aria-current="page"`, within 5 seconds. It shall then click Home on the rail again and give the window its size back. It shall read the names "Apps", "Places", "Home" and "Messenger" from `screenText`, each checked against its file. It shall run as the last step. It shall fail as `RAIL_LANDMARKS` when the two landmarks aren't there once each, and as `RAIL_PICK_IS_PAGE`, with what it saw, when the pick doesn't show so.

## Examples

- Given the rail and the sidebar, and Messenger turning `aria-current="true"` when clicked,
  then the step passes, clicking Home, Messenger, then Home.
- Given Messenger turning `aria-current="true"` only on a later read,
  then the step waits for it and passes.
- Given two `nav`s named "Places",
  then the step fails as `RAIL_LANDMARKS`.
- Given Messenger turning `aria-current="page"` when clicked,
  then the step fails as `RAIL_PICK_IS_PAGE`, and still clicks Home.
