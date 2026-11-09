# kit.button

- Status: active
- Since: 0.1.0
- Source: HAL-1289; base component specs 1, 0.2 and 23.5

The kit shall render a `Button` as a native `<button>` of type `button` unless it is given `type="submit"`, in one of four variants (`primary`, `secondary`, `ghost`, `danger`) and four sizes (`sm`, `md`, `lg`, `touch`), with the variant and size written once as class lists in the kit. When a `Button` has an `icon` and a `label` and no children, the kit shall render a square icon button named by its `label`, with the icon hidden from screen readers. While the layout is the phone's or the pointer is coarse, the kit shall render `sm` and `md` buttons at `lg` with a 48px hit area.

## Examples

- Given `<Button variant="primary">New agent</Button>`,
  when it renders,
  then it is a `<button type="button">` with the primary classes and the label "New agent".
- Given `<Button icon={…} label="Close Support reply" />`,
  when it renders,
  then its accessible name is "Close Support reply" and its icon is `aria-hidden`.
- Given a `md` button,
  when it renders,
  then its classes include `phone:min-h-control-lg`, `touch:min-h-control-lg`, `phone:hit-touch` and `touch:hit-touch`.
