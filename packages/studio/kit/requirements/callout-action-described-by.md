# kit.callout-action-described-by

- Status: active
- Since: unreleased
- Source: HAL-19120 (Sofia's words and accessibility check on HAL-19111: two "Sign in" buttons in Settings › Connections couldn't be told apart); decided by the team (HAL-2282); WCAG 2.4.6

When a `Callout` action names an element that describes it, the action shall be described by that element first and then by whatever the Callout already describes it with (its title and text, for an action that takes focus or with `describeActions`), so the same action in several Callouts, such as one per row of a list, can be told apart. An action that names no element shall be described as before.

## Examples

- Given two Callouts in two rows named "Paperclip · Halonic" and "Paperclip · Acme", each with the action **Sign in** naming its row's name,
  when a screen reader reaches each **Sign in**,
  then it hears that row's name with it.
- Given a Callout with `describeActions` whose action names the row's name,
  when it renders,
  then the action is described by the row's name, then the Callout's text.
- Given a Callout whose action names nothing,
  when it renders,
  then the action has no description, as before.
