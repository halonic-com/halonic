# toolscript-host.preview

- Status: active
- Since: unreleased
- Source: stream HAL-17560 (ToolScript); ADR on HAL-17560, section 3.2 (S17); task HAL-17570

When the toolscript-host package asks to confirm a write, it shall include the header's `ui.preview` blocks and then the capability's own preview lines, built from the frozen copy of the arguments, so the header can't leave out the capability's lines.

## Examples

- Given a capability whose preview is `Set note b` and a header with one preview card,
  when the script writes the note `b`,
  then `confirm` gets the card and then the line `Set note b`.
