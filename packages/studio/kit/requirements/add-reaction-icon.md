# kit.add-reaction-icon

- Status: active
- Since: unreleased
- Source: HAL-19684; Messenger reactions, sketch section 2 (HAL-19139)

The kit's `AddReactionIcon` shall draw a smiling face with a + at its top right, for a button that adds a reaction to a message. It shall draw an outline on the place icons' 24 grid with their 1.8 line, in the text colour, and the face's ring shall stay open where the + sits so the two never touch. It shall be hidden from screen readers, because the button's name says what it does.

## Examples

- Given `<AddReactionIcon />`,
  when it renders,
  then it is an `aria-hidden` outline in `currentColor` with a 1.8 line on its 24 grid.
- Given `<AddReactionIcon />`,
  when it renders,
  then it draws six lines: the open ring, two eyes, the smile and the two strokes of the +.
