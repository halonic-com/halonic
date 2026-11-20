# kit.callout-phone-wrap

- Status: active
- Since: unreleased
- Source: HAL-13770; C234 check PX3 (HAL-13765); C275 check PX4 (HAL-13977); decided by the team (HAL-2282) with Sofia as designer; centred like every kit button's wrapped label (`kit.button`, HAL-14010); WCAG 1.4.10

Where Studio is laid out for a phone, a `Callout`'s action shall never be wider than the Callout's action row, also when it gives `opens`, so its label wraps between words, centred as `kit.button` says, and its button grows in height, and the label is never cut by the Callout. A wrapped label shall keep 8px between its lines and the button's border at the top and bottom; a label on one line shall keep the button's height. The ↗ of an action that gives `opens` shall stay after the label's last word. The words shall not change. On desktop it shall not change.

## Examples

- Given a `danger` Callout with the action **Model calls through a proxy ↗** on a phone 195px wide (a 390px window at 200 %),
  when it renders,
  then the label wraps between words inside the Callout, with ↗ after "proxy", no word is cut, and the first and last lines sit 8px from the border.
- Given the same Callout on desktop,
  when it renders,
  then the label stays on one line.
