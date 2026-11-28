# kit.checkbox-words

- Status: active
- Since: unreleased
- Source: HAL-18916; the design check on HAL-18915, where a Radio group and Checkboxes first sat side by side in `QuestionForm`

Where a `Checkbox` has words, the kit shall set its 16px box on the first line of those words, 2px down (4px on a phone, whose lines are 24px high instead of 20px), so that a box beside words that wrap stays on their first line, as a Radio's circle does. On a phone its words shall be 16px on 24px lines, the size of a Radio's label there. On a phone or a touch screen it shall have 12px above and below its words, so that one line of words sits mid-way in its 48px target.

## Examples

- Given a Checkbox whose words wrap onto two lines,
  when it renders,
  then its box sits beside the first line, not between the two.
- Given a Checkbox and a RadioGroup one under the other on a phone,
  when they render,
  then their words are the same size, and the box and the circle sit the same distance down.
