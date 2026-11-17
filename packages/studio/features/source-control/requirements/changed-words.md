# source-control.changed-words

- Status: active
- Since: unreleased
- Source: HAL-1302 (T9); ux-checklists-t8-t9 (HAL-1360) part 2, 2.4 The words; a11y 13.5

When the person opens What changed, then under each change that covers parts of an item, the Studio shall say what happened to each part with a neutral label: CHANGED when it had a value and has another, ADDED when it had none, REMOVED when it has none now. The old value shall be shown struck through in a `<del>` and the new one in an `<ins>`, each beginning with the hidden words "Before:" or "After:" for a screen reader. ADDED shall show no old value and REMOVED no new one. The label and the strike-through shall carry the meaning, not colour.

## Examples

- Given the agent's `model` went from claude to gpt,
  when the person opens the page,
  then the part says CHANGED, with "claude" in a `<del>` after "Before:" and "gpt" in an `<ins>` after "After:".
- Given the agent's `description` was not set and now is,
  when the person opens the page,
  then the part says ADDED and has no `<del>`.
- Given the agent's `description` was set and now is not,
  when the person opens the page,
  then the part says REMOVED and has no `<ins>`.
