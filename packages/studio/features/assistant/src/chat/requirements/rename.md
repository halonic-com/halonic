# assistant.chat.rename

- Status: active
- Since: unreleased
- Source: HAL-16801 (T14 PR 10); req-assistant (HAL-110); flow-assistant 5.6 (HAL-647); microcopy 19.5 (HAL-751)

When the person picks ⋮ › **Rename** in the panel, the header shall turn the chat's title into a field named "Rename *title*", with the text selected. Enter or leaving the field shall save the title trimmed; an empty title shall put the old one back, and Escape shall cancel without closing the panel. Focus shall then go back to the box.

## Examples

- Given the chat "Add a routine", when the person renames it to "  Daily triage  " and presses Enter,
  then the chat is saved as "Daily triage" and the header shows it.
- Given the rename field, when the person clears it and leaves the field,
  then nothing is saved and the header shows "Add a routine" again.
- Given the rename field with "Other", when the person presses Escape,
  then nothing is saved and the panel stays open.
