# settings.appearance-panel-opacity

- Status: active
- Since: 0.1.0
- Source: HAL-1294 (T11); req-settings `settings.appearance.panel-opacity` (HAL-110); flow-settings 5 (HAL-646); ux-checklists-t4-t5-t11 3.7 (HAL-1185)

The Studio shall keep a panel opacity from 10% to 100% in steps of 10%, with 80% as the default, and give it to the window as `--panel-opacity`. When the stored panel opacity is a number outside that range or between two steps, it shall be the nearest step inside the range. When it isn't a number, it shall be 80%.

## Examples

- Given the stored panel opacity is 0.64,
  when the window opens,
  then the panel opacity is 60%.
- Given the stored panel opacity is 0.05,
  when the window opens,
  then the panel opacity is 10%.
- Given the stored panel opacity is 2,
  when the window opens,
  then the panel opacity is 100%.
- Given the stored panel opacity is "high",
  when the window opens,
  then the panel opacity is 80%.
