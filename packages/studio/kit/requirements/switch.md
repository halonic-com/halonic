# kit.switch

- Status: active
- Since: 0.1.0
- Source: HAL-2977; base component specs 14 (Switch), 23 A1 and 23.5

The kit's `Switch` shall be a native checkbox with `role="switch"`, drawn as a 32×18 track with a full radius and a 14px `on-primary` thumb 2px inside it, named by its sentence next to it or else by its `label`, one of which its type shall require. Off, the track shall be `surface-muted` with a `border-control` edge and the thumb at the start; on, the track shall fill `primary` and the thumb shall jump to the end, without sliding. It shall show the standard focus ring. While the pointer is over the switch or its sentence, an off track's edge shall turn `fg-muted` and an on track shall turn `primary-hover`. When the user clicks it, its sentence or presses Space on it, the kit shall call `onChange` with the new value. A switch with a sentence shall put the sentence first and the switch at the end of a row at most 360px wide, and on a phone the full width, at least 48px high on a phone or a touch screen, with the sentence as part of its target. A switch without a sentence shall take taps in a 48px square centred on it on a phone or under a coarse pointer. An `unavailable` switch shall stay focusable and keep its value, at 45% (60% when the user asks for more contrast, full strength in forced colours), point `aria-describedby` at its reason, and ignore clicks and Space. Inside a Field a switch with a sentence shall be named by its sentence alone, and described by the Field's hint or error line. In forced colours the thumb shall be `CanvasText`, an on track shall fill `Highlight` with a `HighlightText` thumb, and an unavailable switch shall be `GrayText`.

## Examples

- Given an off Switch "Send a summary every morning",
  when the user clicks its sentence,
  then `onChange` is called with `true`.
- Given an on Switch with `unavailable={{ reason: "why" }}`,
  when the user presses Space on it,
  then `onChange` isn't called, it stays on and focusable, and it is described by "why".
- Given a Switch in a Field with the error "Couldn't save. Try again.",
  when it renders,
  then it is named by its sentence and described by the error line.
- Given an off Switch "Turn on Sorter" without a sentence, on a touch screen,
  when the user taps 12px from its track,
  then `onChange` is called with `true`.
