# cli.runs-show-connector-not-started

- Status: active
- Since: unreleased
- Source: HAL-15081 (Tomas's C540 walk on HAL-15074, #3: `halonic runs show` marked a step "!" for a connector that didn't start, but never said why, while `halonic run` had said it only live)

When `halonic runs show` shows a run whose log has a `connector.listing-failed` (`events.connector-listing-failed`) or a `connector.part-off` (`events.connector-part-off`), it shall print, after the step lines and a blank line, the warning `halonic run` gives for that connector (`cli.run-connector-warning`), once for each connector, in the order of the log. For a `connector.part-off`, it shall instead print once for each connector, part and reason: "! The backend of <connector> didn't start, so its tools are off in this run." or "! The program <name> of <connector> didn't start, so its tools are off in this run.", then, indented under it, a line for the reason, except for `failed`, which the log doesn't explain, and "To see why, run halonic tools review <connector>". A run whose connectors all started shall get no such lines.

## Examples

- Given a finished Acme Mail triage run whose step Read the email logged `connector.listing-failed` for `handbook` twice, with `why: "program-missing"` and `name: "npx-nope"`,
  when `halonic runs show` shows it,
  then after "! Read the email   Writer · default   1 s" and a blank line it prints "! handbook didn't start, so its tools are off in this run.", "  The program npx-nope isn't on this computer." and "  Install npx-nope, or change the command in library/connectors/handbook.connector.yaml." once, then the run's ending.
- Given a `connector.listing-failed` with `why: "other"` for `handbook`,
  when the run is shown,
  then the lines are "! handbook couldn't list its tools, so they are off in this run." and "  To see why, run halonic tools review handbook".
- Given `connector.part-off` events for `orders`'s `backend` (`failed`) and `local:lister` (`not-trusted`), then a `connector.listing-failed` for `orders`, then the backend's again,
  when the run is shown,
  then the lines are "! The backend of orders didn't start, so its tools are off in this run.", "  To see why, run halonic tools review orders", "! The program lister of orders didn't start, so its tools are off in this run.", "  Your trust doesn't cover it as it is now." and "  To see why, run halonic tools review orders".
- Given a run whose connectors all started,
  when it is shown,
  then the ending follows the step lines with no connector line.
