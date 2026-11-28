# assistant.start-screen.halo

- Status: active
- Since: unreleased
- Source: HAL-16803 (T14 PR 12); flow-assistant 6.2 (HAL-647); component specs revision 16 (HAL-175); mockup-assistant (HAL-878)

Where the start screen shows a Build chat not about one item, it shall draw the halo (`bg-halo-spot`) on one decorative element behind the heading, the line and the box, hidden from screen readers and from the pointer, and the glow (`shadow-halo-glow`) on a rounded wrapper round the box. Neither shall move. Both shall go with the start screen once the first message is sent, and the panel shall never show them.

## Examples

- Given a new Build chat in a tab,
  then the start screen has one `aria-hidden` element with `bg-halo-spot` and the box sits in a `rounded-composer shadow-halo-glow` wrapper.
- Given the same chat in the panel,
  then it has neither.
