# kit.note-lines

- Status: active
- Since: 0.1.0
- Source: HAL-12317 (Noah's spec), HAL-12318

The kit's `NoteLines` shall show a list, named by its `label`, with one line per note in the order given: a 16px info icon in `fg-muted`, hidden from screen readers, then the note in `text-small` `fg-muted`, 4px between lines and inset 16px at the sides. It shall show each note whole as plain text, never as markup, and let it wrap under itself, never shorten it. It shall have no fill, no border, no action and no role, and be neither a live region nor a callout. With no notes, it shall render nothing.

## Examples

- Given NoteLines "Notes on this run" with the notes "Left out temperature: claude-sonnet-5-5 doesn't take it." and "Left out top_p: claude-sonnet-5-5 doesn't take it.",
  when it renders,
  then a list named "Notes on this run" shows the two notes in that order, each after the info icon, in `fg-muted`.
- Given the note "<b>x</b>",
  when it renders,
  then the line reads "<b>x</b>" as text, with no bold.
- Given NoteLines with no notes,
  when it renders,
  then nothing is rendered.
