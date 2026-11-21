# kit.switch-row-target

- Status: draft
- Since: unreleased
- Source: HAL-15338; Routines UX check RT11 (HAL-15304); flow-routines 5.3 (component specs, Switch on a phone); WCAG 2.5.8

Where a `Switch` without a sentence of its own has `rowTarget`, its target shall be the whole row it sits in rather than a 48px square: its label's ::after shall cover the nearest positioned box, and a press anywhere in that row shall turn it. A `Card` header with actions shall be that box, and on a phone it shall be at least 48px high. A header without actions shall not change.

## Examples

- Given the routine page's When card on a phone, with "When", the hidden "On" and the switch "Runs on its own" in its header,
  when the user taps "When",
  then the switch turns.
- Given a Card header with a switch as its action on a phone,
  then the header is at least 48px high; a Card header without actions keeps its own height.
