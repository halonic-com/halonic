# settings.appearance-theme

- Status: active
- Since: 0.1.0
- Source: HAL-1294 (T11); req-settings `settings.appearance.theme` (HAL-110); flow-settings 5 (HAL-646); ux-checklists-t4-t5-t11 3.7 and 3.22 (HAL-1185)

The Studio shall offer the themes System, Light and Dark, with System as the default. When the theme changes, the whole window shall change at once, without a reload: Light and Dark shall set the window's theme, and System shall follow the computer's light or dark setting. When the stored theme isn't one of the three, the theme shall be System.

## Examples

- Given the theme is System,
  when the user picks Dark,
  then the window's root says `data-theme="dark"`.
- Given the theme is Dark,
  when the user picks System,
  then the window's root has no `data-theme`, so it follows the computer.
- Given the stored theme is "sepia",
  when the window opens,
  then the theme is System.
