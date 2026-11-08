# Decision: widen `shell.keybindings`

- Requirement: `shell.keybindings` (`packages/studio/shell/requirements/keybindings.md`)
- Task: HAL-223, from the review of HAL-171
- Approval: the task itself asks for this requirement change; the maintainer approves it in review

## What changes

The requirement grows; nothing it promised before is taken away.

- `Cmd` means `Meta`. `Mod` means `Meta` when the host says it runs on macOS, and `Ctrl` otherwise.
  The shell stays headless: the host passes `platform` to `createShell`, and `Mod` is resolved
  when a binding is added and when a key press is matched.
- A trailing `+` or `Plus` is the plus key, so `Ctrl++` can be bound.
- A single space (what `KeyboardEvent.key` gives for the space bar) means `Space` when it is the
  whole keys or directly follows the last `+` (`Ctrl+ `); padding such as `Ctrl + ` is still
  refused. `Esc` means `Escape`.
- A context named twice in a `when` counts once, so `a && a` no longer beats `a && b`.
- A `when` that asks for a context and its negation, such as `a && !a`, is refused with a
  `ShellError`, because it can never hold.

## Why

Real features will bind these keys, and a host passes `KeyboardEvent.key` straight to `resolve`.
Without these changes `Ctrl++` and the space bar can't be bound or matched, macOS shortcuts need
two bindings, and a repeated term quietly wins over a more specific binding.

No test was weakened; each item has a new test in `src/points/keybindings.test.ts`.
