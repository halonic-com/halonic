# kit.slider

- Status: active
- Since: 0.1.0
- Source: HAL-3520; base component specs 18.6 (Slider, revision 14), 23 A1 and 23.5; visual review kit T1-F45, F48 and F49

The kit's `Slider` shall be a native range input without its own look, named by the Field's label, 32px high and 48px high on a phone, with the value shown 12px to its right in `text-body` with tabular figures, right-aligned in at least 4ch and hidden from screen readers, and the same value as its `aria-valuetext`. Its track shall be 6px high with a full radius: `surface-muted` with a 1px `border-control` edge, and `primary` without an edge from the start of the range to the thumb, in Chromium, WebKit and Firefox. Its thumb shall be a 16px `primary` circle in a 2px `surface-raised` ring, `primary-hover` under a hovering pointer or while pressed, and with keyboard focus the standard focus ring in place of its ring. While the thumb moves the kit shall call `onChange` with each value. When a drag lets go, the kit shall call `onCommit` once with the value; when the user moves it with an arrow key, Page Up or Down, Home or End, the kit shall call `onCommit` once for each step. When the screen passes an old `value` after a failed save, the thumb shall go back to it. Inside a Field with an error, the slider shall be `aria-invalid` and described by the error line. On a phone the thumb shall take a 24px grab area round its 16px circle. An `unavailable` slider shall stay focusable and keep its value, at 45% (60% when the user asks for more contrast, full strength in forced colours), point `aria-describedby` at its reason, ignore drags and the keys that move it, and call neither `onChange` nor `onCommit`. In forced colours the track shall keep a `CanvasText` edge, the filled part and the thumb shall be `Highlight`, and an unavailable slider shall be `GrayText`.

## Examples

- Given a Slider "Panel opacity" from 10 to 100 at 40 that shows `v + "%"`,
  when it renders,
  then its `aria-valuetext` is "40%" and the track is filled a third of the way.
- Given that Slider,
  when the user drags the thumb through 50 and 60 to 70 and lets go,
  then `onChange` is called with 50, 60 and 70, and `onCommit` once, with 70.
- Given that Slider with a step of 5,
  when the user presses the right arrow three times,
  then `onCommit` is called with 45, 50 and 55.
- Given an unavailable Slider with the reason "Turn on See-through panels first.",
  when the user presses the right arrow on it,
  then the key does nothing, it stays at 40 and focusable, and it is described by the reason.
