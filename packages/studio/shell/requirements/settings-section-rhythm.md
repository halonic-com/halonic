# shell.settings-section-rhythm

- Status: active
- Since: unreleased
- Source: HAL-11844; Noah's ruling on HAL-11842

The shell shall own the spacing of every Settings section: its name, 8px, the saved or workspace line where there is one, 8px, the section's `description` where it registered one, 20px, then the section's view. A section's `description` is a string or a function of the context and the place that may answer later; a function that fails, or answers nothing, leaves the line out. A section's view shall put no top margin of its own on its root and shall not repeat its description in its body.

## Examples

- Given a section registered with a `description`,
  when Settings shows it,
  then the description sits 8px under the name and the view starts 20px below it.
- Given a section whose `description` answers later,
  when Settings shows it,
  then the line appears under the name once it answers.
- Given a section whose `description` fails,
  when Settings shows it,
  then no line shows and the view still starts 20px below the name.
