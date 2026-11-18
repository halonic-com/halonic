# kit.header-badge-status

- Status: active
- Since: unreleased
- Source: HAL-12240; phase B build plan decision 18 (HAL-12232); tunnel phase B screens, decision 4 and "Accessibility and motion" (HAL-12206)

Where `as` is `"status"` (the phone's connection label), the kit's `HeaderBadge` shall be a real `<button type="button">` in the top bar itself, not on a line of its own: at least 32px high with a 48px target, radius 8px, `text-body-strong`, an 8px dot, its words, and a 16px chevron, with the dot and the chevron hidden from screen readers. Its `tone` shall set its look: `success` a `surface-muted` fill with `fg` words and a `success` dot, `waiting` the same with an `attention` dot, `attention` an `attention-soft` fill with `attention` words and dot, and `danger` a `danger-soft` fill with `danger` words and dot. Its name shall be its words, with a middle dot read as a comma, then a full stop and its `action` ("Can't reach your computer. Details"). It shall wrap at large text instead of being cut, show the standard focus ring, and call its `onClick` when tapped.

## Examples

- Given the label "Can't reach your computer" with the tone `attention` and the action "Details",
  when it renders,
  then it has the `attention-soft` fill and is named "Can't reach your computer. Details".
- Given the label "Connected · Tim's laptop" with the tone `success`,
  when it renders,
  then its dot is `success`, its fill is neutral and it is named "Connected, Tim's laptop. Details".
- Given that label on a phone,
  when the user taps it,
  then its `onClick` is called once, and it is not on a line of its own.
