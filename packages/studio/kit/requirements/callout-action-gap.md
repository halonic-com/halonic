# kit.callout-action-gap

- Status: active
- Since: unreleased
- Source: HAL-13770; C399 check CA1 (HAL-14480); decided by the team (HAL-2282) with Sofia as designer; WCAG 1.4.11

Where Studio is shown in forced colours (high contrast), a `Callout`'s actions shall keep 4px between each other, so each button's outline stays its own. Outside forced colours the action row shall not change.

## Examples

- Given a `danger` Callout with the actions **Model calls through a proxy ↗** and **Run again** in high contrast,
  when it renders,
  then there are 4px between the two buttons' outlines.
- Given the same Callout without high contrast,
  when it renders,
  then the two buttons sit side by side as before.
