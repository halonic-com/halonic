# shell.settings-open

- Status: active
- Since: 0.1.0
- Source: HAL-1294 (T11); flow-settings 2 (HAL-646); UX checklist part 3 (HAL-1185)

When Settings opens, the shell shall show the section the caller asked for. If the caller asked for none, or for one no feature added, the shell shall show the section shown when Settings last closed in this window, else Appearance, else the first section in the list. If no feature added a section, the shell shall have no section to show.

## Examples

- Given the sections `models`, `appearance` and `formats`,
  when Settings opens for `models`,
  then `models` shows.
- Given Formats was shown when Settings last closed,
  when Settings opens without a section,
  then `formats` shows.
- Given Formats was shown last and no feature added `trust`,
  when Settings opens for `trust`,
  then `formats` shows.
- Given only `models` and `formats`, and nothing shown before,
  when Settings opens without a section,
  then `models` shows.
