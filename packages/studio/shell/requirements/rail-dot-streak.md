# shell.rail-dot-streak

- Status: active
- Since: unreleased
- Source: HAL-20745; MOTION.md (final) on HAL-20742, the board's option A (the 31px line)

While the window's root element names the motion `streak`, when the selection moves to another rail entry, the dot shall travel to the new button over `--duration-dot-streak` on the curve `--ease-dot`, and on a linear clock stretch into a line 35% of its width and 5.1 times its length at the middle of its way, round again as it lands. While the person prefers reduced motion, the dot shall fade as it does for Lead and shall not stretch.

## Examples

- Given the root element has `data-rail-dot-motion="streak"`,
  when the person clicks another entry,
  then the dot is about 2px wide and 31px long halfway through its 400ms.
- Given Streak is chosen and the person prefers reduced motion,
  when the person clicks another entry,
  then the dot fades to the new button in 150ms and keeps its shape.
