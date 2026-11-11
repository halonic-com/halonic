# settings.display-prefs

- Status: active
- Since: 0.1.0
- Source: HAL-1294 (T11); req-settings (HAL-110) `settings.appearance.theme`, `.frame-colours`, `.panel-opacity`, `settings.formats.one-format-setting`; flow-settings 3 (HAL-646); ux-checklists-t4-t5-t11 3.3 (HAL-1185)

The Studio shall keep the display settings (Appearance, Formats and Developer) for this computer, or for this browser when served, and for every workspace, never in a workspace file. When a stored value can't be read or isn't one the setting accepts, the setting shall start from its default without an error. When another window of the same browser changes a setting, the setting shall show the new value, unless this window is still saving its own change to it.

## Examples

- Given the stored theme is "sepia",
  when Settings reads the theme,
  then it is System, and no error shows.
- Given the stored theme is text that isn't JSON,
  when Settings reads the theme,
  then it is System.
- Given another window of the browser sets the theme to Dark,
  when this window's storage event arrives,
  then this window's theme is Dark.
