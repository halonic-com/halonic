# Decision: `shell.keybindings` refuses a bare Escape

- Requirement: `shell.keybindings` (`packages/studio/shell/requirements/keybindings.md`)
- Task: HAL-973, from HAL-965 (E3, rule A7)
- Approval: HAL-965 agreed this change; the maintainer (Liam) approves it in review

## What changes

- `keybindings.add` now throws a `ShellError` for a bare `Escape` (`Esc`, `escape`, with or
  without a `when`). The message names the feature and points to the close stack. `Escape` with
  a modifier, such as `Shift+Esc`, is still allowed.
- The requirement's example that bound `Esc` to `palette.close` now binds `Shift+Esc`, and a new
  example shows the refusal.
- The test "accepts the space bar as KeyboardEvent.key spells it, and Esc for Escape" binds
  `Shift+Esc` instead of `Esc`. It still checks that `esc` is read as `Escape`. A new test checks
  the refusal.

## Why

Esc must close one thing at a time in a fixed order: inline edit, menu, tooltip, dialog or sheet,
summary drawer, stacked card, docked card, maximise, side panel. That order lives in one place,
the new close stack (`shell.close-stack`), which Android's Back uses too. A feature that bound a
bare Esc itself would jump that order, for example closing its own panel while a menu is still
open. Refusing it at registration keeps the order honest as features are added.

No feature binds a bare Esc today, so nothing breaks. The shell had no panel Esc binding of its
own to replace yet; the panel registers with the close stack when the layout is built.
