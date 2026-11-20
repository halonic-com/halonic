# shell.header-badges

- Status: active
- Since: unreleased
- Source: HAL-715 (setup flow item 8); HAL-177 flow-workspace 4.2

The shell shall let a feature show a header badge state, `{ id, label, tone, priority }`, and remove it again with the function that showing it returned. The window shall show the states at the left of the status bar, and on a phone in the notice strip (`shell.phone-notice-badges`), highest `priority` first, then by `id`, and nothing while there are none. A state with an `action` and an `onSelect` shall be one button that calls `onSelect`; any other state shall be a chip. A state with a `tooltip` shall show it on hover and keyboard focus, and its button shall be described by it, so a screen reader reads it after the name. The trust badge shall have the highest priority (`trustBadgePriority`), so connector states sit below it. If a state is shown with an id that is already shown, then the shell shall throw a `ShellError` that names the id.

## Examples

- Given the states `needs-sign-in` and `api-off` (priority 10) and `workspace-trust` (priority 1000),
  when the badges are listed,
  then the order is `workspace-trust`, `api-off`, `needs-sign-in`.
- Given a state was removed and another state took its id,
  when the first remover is called again,
  then the second state stays.
- Given the trust badge with the tooltip "Routines and connectors start only in a trusted workspace.",
  when it renders,
  then its button's description is that tooltip's text.
- Given two features show the id `api-off`,
  then the second call throws a `ShellError` naming `api-off`.
