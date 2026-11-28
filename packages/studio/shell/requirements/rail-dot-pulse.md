# shell.rail-dot-pulse

- Status: active
- Since: unreleased
- Source: HAL-20745; MOTION.md (final) on HAL-20742, the board's option A (Pulse with its ring)

While the window's root element names the motion `pulse`, when the selection moves to another rail entry, the dot shall move as it does for Lead, and one ring, a 40px circle with a 1.5px line in `rail-pulse` centred on the new button, shall open from 70% to 145% of its size on the curve `--ease-pulse-ring` while it fades from 70% to nothing on a linear clock, over `--duration-dot-pulse-ring`, starting when 70% of `--duration-dot-lead` has passed. The ring shall not be shown before or after, shall be hidden from screen readers and shall not be clickable. When the selection moves again while the ring is open, the ring shall stop at once and a new one shall open on the new button. While the person prefers reduced motion, the dot shall fade as it does for Lead and no ring shall open.

## Examples

- Given the root element has `data-rail-dot-motion="pulse"`,
  when the person clicks Inbox,
  then a ring opens round Inbox's button 252ms later and is gone 500ms after that.
- Given Pulse is chosen and the person prefers reduced motion,
  when the person clicks another entry,
  then the dot fades to the new button and no ring opens.
