# settings.failed-save

- Status: active
- Since: 0.1.0
- Source: HAL-1294 (T11); save model (HAL-1102, decided: saves by itself); flow-settings 3 (HAL-646); ux-checklists-t4-t5-t11 3.9 (HAL-1185); state-coverage ST (HAL-2160)

The Studio shall save each display setting by itself: a change shall show at once and be stored straight away, with no Save button. If storing fails, the setting shall go back to its value from before and keep the failure until it next saves, unless a newer change to the same setting came in while it was saving. A save that succeeds shall clear the setting's failure.

## Examples

- Given the theme is System and storing fails,
  when the user picks Dark,
  then Dark shows at once, the theme goes back to System, and the theme has a failure.
- Given the theme has a failure,
  when the user picks Light and it is stored,
  then the theme is Light and has no failure.
- Given the user picks Dark and then Light before Dark is stored,
  when storing Dark fails after Light was stored,
  then the theme stays Light, with no failure.
