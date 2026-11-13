# shell.header-badges

- Status: active
- Since: 0.1.0
- Source: HAL-715 (setup flow item 8); HAL-177 flow-workspace 4.2

The shell shall let a feature show a header badge state, `{ id, label, tone, priority }`, and remove it again with the function that showing it returned. The window shall show the states at the left of the status bar, highest `priority` first, then by `id`, and nothing while there are none. A state with an `action` and an `onSelect` shall be one button that calls `onSelect`; any other state shall be a chip. The trust badge shall have the highest priority (`trustBadgePriority`), so connector states sit below it. If a state is shown with an id that is already shown, then the shell shall throw a `ShellError` that names the id.

## Examples

- Given the states `needs-sign-in` and `api-off` (priority 10) and `workspace-trust` (priority 1000),
  when the badges are listed,
  then the order is `workspace-trust`, `api-off`, `needs-sign-in`.
- Given a state was removed and another state took its id,
  when the first remover is called again,
  then the second state stays.
- Given two features show the id `api-off`,
  then the second call throws a `ShellError` naming `api-off`.
