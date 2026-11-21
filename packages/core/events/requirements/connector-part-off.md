# events.connector-part-off

- Status: active
- Since: unreleased
- Source: HAL-12343 (from Nina's C54 check on HAL-12637: a run whose plugin had a local tool that couldn't start ended without a word about it)

The run log shall have a `connector.part-off` event for one part of a connector, such as a plugin's backend or one of its local tools, that offers no tools in a run, with the `agent` whose turn found it, the connector's id in `connector`, the part in `part` (`backend`, or `local:` and the local tool's name) and why in `reason`, one of `needs-desktop-app`, `sandbox-unavailable`, `sandbox-not-fenced`, `network-needs-srt`, `settings-not-set`, `not-trusted` and `failed`. It shall never hold the error's own text, a secret's value or the program's output.

## Examples

- Given the event types of the run log,
  when they are listed,
  then `connector.part-off` is among them, with `agent`, `connector`, `part` and `reason`.
- Given a `connector.part-off` event whose `reason` is an error's text,
  when its type is checked,
  then it is not a valid run event.
