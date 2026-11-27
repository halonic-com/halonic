# kit.rail-button-motion

- Status: active
- Since: unreleased
- Source: HAL-20675; build plan P2 on HAL-20617, the rail's scaling exception (decision note `decisions/ravi/HAL-20675-rail-button.md`); RAIL-ICONS.md on HAL-20672

While the person does not prefer reduced motion, when the pointer rests on a `RailButton` that is not selected, the kit shall grow its drawing to 110% over 180ms with the press curve, and while it is pressed, shrink it to 90% over 60ms. A selected RailButton shall not scale. While the person prefers reduced motion, no RailButton shall scale; its fill still changes. No other kit part shall grow or shrink under the pointer or when pressed.

## Examples

- Given a RailButton that isn't selected,
  when the pointer rests on it,
  then its drawing grows to 110% in 180ms.
- Given the person prefers reduced motion,
  when the pointer rests on a RailButton,
  then its circle fills and its drawing keeps its size.
- Given the selected RailButton,
  when the user presses it,
  then its drawing keeps its size.
