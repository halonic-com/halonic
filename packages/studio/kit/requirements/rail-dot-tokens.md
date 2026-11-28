# kit.rail-dot-tokens

- Status: active
- Since: unreleased
- Source: HAL-20745; RAIL-ICONS.md on HAL-20672 and MOTION.md (final) on HAL-20742, the board's option A

The kit's theme shall have the values of the rail's white dot: `--color-point-of-light` (`#ffffff`) and its glow `--shadow-point-of-light`; the dot's curve `--ease-dot` (`cubic-bezier(0.25, 1, 0.5, 1)`) and its times `--duration-dot-lead` (360ms) and `--duration-dot-streak` (400ms); the ring's colour `--color-rail-pulse` (`#60a5fa`), curve `--ease-pulse-ring` (`cubic-bezier(0.33, 1, 0.68, 1)`) and time `--duration-dot-pulse-ring` (500ms); and `--duration-rail-fade` (150ms). The two colours shall have the same value in light and in dark.

## Examples

- Given the dark theme,
  when the rail draws the ring,
  then its line is `#60a5fa`, as in light.
- Given the theme is loaded,
  when the shell reads `--duration-dot-streak`,
  then it reads 400ms.
