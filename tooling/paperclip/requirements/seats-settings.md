# paperclip.seats-settings

- Status: active
- Since: unreleased
- Source: HAL-16008; the `seats` plugin as its own plugin in the supervision plugins plan on HAL-15997 (phase 3); seat details in board-only settings that are empty by default, moves behind a board-only switch that is off by default, its own tables for the seat forecast (HAL-16030)

When the `seats` plugin reads its settings, it shall start with no seats and moving agents off until the board sets them, keep a seat only with a valid id, role and folder, keep only the first seat with an id, and create its tables only in the schema Paperclip gives the plugin.

## Examples

- Given the plugin as installed,
  when nobody has changed its settings,
  then it has no seats and moving agents is off.
- Given settings with two seats under one id, a seat without a folder, a seat id with spaces and a seat with an unknown role,
  when the plugin reads them,
  then it keeps only the first seat with that id.
- Given the plugin's migrations,
  when Paperclip runs them,
  then every table and index they create is in the plugin's own schema, `plugin_seats_2a33967373`.
