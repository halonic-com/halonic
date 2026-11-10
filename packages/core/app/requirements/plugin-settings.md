# app.plugin-settings

- Status: active
- Since: 0.1.0
- Source: HAL-1735 plan, section 1 (`settings`, `saveSettings` and `forget`), approved by Liam on HAL-4038; the plugins ADR (`docs/adr/2026-11-09-plugins.md`), section 3; HAL-1803 (settings are per computer, and only removing the plugin deletes them)

The app's `PluginService` shall keep each plugin's setting values in the profile's `RecordStore`, in the `plugin-settings` collection, one record keyed by the plugin's id. It shall give, for each setting the plugin declares now, the saved value when it still fits the setting as `format.plugin-setting-values` asks, and otherwise the setting's `default`; it shall give no value for a `secret` setting. It shall save a plugin's values in place of the saved ones only when every value fits a setting the plugin declares and every required setting has a value or a `default`, and otherwise save nothing and give every problem by setting. Forgetting a plugin shall delete its record and compact the collection, so the old values leave the storage; it shall leave the plugin's trust and the other plugins' values.

## Examples

- Given the weather plugin with a required `root` and a `units` choice whose default is `metric`,
  when a person saves `root` and the values are read,
  then they hold `root` and `units: metric`.
- Given a saved `units` of `imperial`, and the plugin now offers only `metric` and `kelvin`,
  when the values are read,
  then `units` is `metric` again.
- Given values without `root`, with an unknown setting, with text for a number, and with a value for the `secret` setting,
  when they are saved,
  then nothing is saved and there is one problem for each.
- Given saved values for `weather` and `rain`,
  when `weather` is forgotten,
  then the collection holds only `rain`'s record, as one compacted change.
