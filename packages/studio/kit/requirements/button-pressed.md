# kit.button-pressed

- Status: active
- Since: unreleased
- Source: HAL-19082 (Noah's design check of the activity panel, item 17, against the HAL-18558 activity-panel mockup, revision 3)

When an icon `Button` is given `pressed`, the kit shall set `aria-pressed` to it, and a pressed button shall keep its variant's hover fill (a ghost button its full text colour too, on a tinted fill its `surface` fill) and a 2px outline in high contrast, so a toggle's on state shows as a filled tile and not by colour alone. A button without `pressed` shall have no `aria-pressed`, and `pressed` shall not be accepted on a button with words.

## Examples

- Given `<Button variant="ghost" size="sm" icon={…} label="Activity" pressed />`,
  when it renders,
  then it has `aria-pressed="true"` and its classes include `aria-pressed:bg-surface-muted`.
- Given a pressed `secondary` icon button,
  when it renders,
  then its classes include `aria-pressed:bg-surface-subtle` and `forced-colors:aria-pressed:outline-solid`.
- Given `<Button variant="ghost" icon={…} label="Close" />`,
  when it renders,
  then it has no `aria-pressed`.
