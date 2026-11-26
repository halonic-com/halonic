# toolscript.header-ui

- Status: active
- Since: unreleased
- Source: Source: stream HAL-17560 (ToolScript); ADR on HAL-17560, section 4.2 and S17; task HAL-17567

When a ToolScript header's `ui` is checked, the toolscript package shall take only the components `card`, `table`, `form` and `buttons`, each in its own place, with a button carrying only a confirm and a cancel label and no address or action, and a form naming only inputs the header declares.

## Examples

- Given a `ui.preview` holding a component `image`,
  when it is checked,
  then it is refused.
- Given a `buttons` component with a `url`,
  when it is checked,
  then it is refused.
- Given a `form` field naming an input the header doesn't declare,
  when it is checked,
  then it is refused.
