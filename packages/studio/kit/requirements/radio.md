# kit.radio

- Status: active
- Since: 0.1.0
- Source: HAL-2977; base component specs 19.1 (Radio), 23 A1 and 23.5

The kit's `RadioGroup` shall be a `role="radiogroup"` of native radios that share one name, so that the group is one Tab stop, the arrow keys move the choice and Space picks it. Inside a Field the group shall be named by the Field's label through `aria-labelledby` and described by the Field's hint or error line; outside one, by its `label`. Each radio shall be drawn as a 16px circle with a `border-control` edge on `surface`, 2px down so that it lines up with the first line of its label, with its label 8px after it as part of its target and an optional note under the label in `fg-subtle`. Each radio shall be named by its label's words alone and described by its note, so that a screen reader reads the note once. A picked radio shall show a 5px `primary` ring round an `on-primary` centre. While the pointer is over a radio or its label, an empty circle's edge shall turn `fg-muted` and a picked ring `primary-hover`. It shall show the standard focus ring. When the user picks an option, the kit shall call `onChange` with its value; the group shall show the picked value it is given, so that a screen that puts the old value back after a failed save shows the old choice. Options shall be 8px apart, 12px while the picked option has a field, and only the picked option's field shall be rendered, under its label and 24px in. An `unavailable` option shall stay listed, be skipped by the arrow keys, be described by its note, which its type shall require, and show its circle and words at 45% (60% when the user asks for more contrast, `GrayText` in forced colours) with the note at full strength. When the Field has an error and nothing is picked, every circle shall take a `danger` edge and the group `aria-invalid`. On a phone or a touch screen every option shall be at least 48px high, with options 0px apart. In forced colours a picked circle shall draw its ring in `Highlight`.

## Examples

- Given a RadioGroup in a Field "Connect with" with "Web address" picked,
  when the user presses the down arrow on it,
  then `onChange` is called with the next option's value.
- Given an option "Docker image" with `unavailable: true` and the note "Needs Docker.",
  when it renders,
  then it is listed, can't be picked, is named "Docker image" and is described by "Needs Docker.".
- Given options with fields and "Local command" picked,
  when the group renders,
  then only "Local command"'s field is in the page.
- Given a screen that saves the choice at once and puts the old value back when the save fails,
  when the user picks another option and the save fails,
  then the old option shows as picked again.
