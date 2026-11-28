# studio-click-test.rail-current-step

- Status: active
- Since: unreleased
- Source: HAL-20944; Nora's review of #6912

When the click test runs the rail step, it shall close a Settings dialog left open, widen the window to 1280 × 800, require exactly one `nav` named "Apps" and one named "Places", click Messenger on the rail, and pass once Messenger is `aria-current="true"` and no rail button is `aria-current="page"`, within 5 seconds. It shall then click Home on the rail and give the window its size back. It shall fail as `RAIL_LANDMARKS` when the two landmarks aren't there once each, and as `RAIL_PICK_IS_PAGE`, with what it saw, when the pick doesn't show so.

## Examples

- Given the rail and the sidebar, and Messenger turning `aria-current="true"` when clicked,
  then the step passes, clicking Messenger then Home.
- Given two `nav`s named "Places",
  then the step fails as `RAIL_LANDMARKS`.
- Given Messenger turning `aria-current="page"` when clicked,
  then the step fails as `RAIL_PICK_IS_PAGE`, and still clicks Home.
