# shell.rail-dot-seat

- Status: active
- Since: unreleased
- Source: HAL-21048 (post-merge check HAL-21037 of #6915); the approved mockup, v26 on HAL-20617

While a rail entry with a place's drawing is selected, the icon rail shall fill that drawing in `--color-rail-glass` in light and in dark, so the white dot on it reads at 3:1 or more. While an entry is not selected, the rail shall draw its outline in the text colour.

## Examples

- Given the dark theme and Home selected,
  when the rail is shown,
  then Home's drawing is filled in the dark glass and the white dot on it reads at 3:1 or more.
- Given Home is selected,
  when the rail draws Inbox,
  then Inbox is its outline in the text colour.
