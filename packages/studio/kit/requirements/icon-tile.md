# kit.icon-tile

- Status: active
- Since: 0.1.0
- Source: HAL-1687 (theme proposal, "What carries over to the Studio"), HAL-1900

The kit's `IconTile` shall draw its icon at 20px in `accent-text`, centred on a 40px tile with the halo tint and an 8px radius, and shall hide the tile from screen readers, because the words next to it say the same.

## Examples

- Given `<IconTile><FileIcon /></IconTile>`,
  when it renders,
  then there is one `aria-hidden` 40px tile with `bg-halo-tint`, and the icon inside a 20px box.
