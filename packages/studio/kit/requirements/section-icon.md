# kit.section-icon

- Status: active
- Since: 0.1.0
- Source: HAL-9385 (B16); design check B16 (HAL-9316); UX checklist 3.1 and 3.23

The kit's `SectionIcon` shall draw one icon for each Settings section that has one: Models, Trust, Appearance, Formats, Assistant, Agent sandbox, Trusted sources and About, named by the section's id. It shall draw an outline on the same 24 grid and 1.8 line as the place icons, in the text colour, and be hidden from screen readers, because the row names the section.

## Examples

- Given `<SectionIcon name="assistant" />`,
  when it renders,
  then it is an `aria-hidden` outline in `currentColor` with a 1.8 line on its 24 grid.
- Given the section ids Settings lists,
  when each one's icon is drawn,
  then every one draws a path of its own.
