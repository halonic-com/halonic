# plugins.plugin-settings

- Status: active
- Since: 0.1.0
- Source: HAL-1740; plugin screens design section 7 (HAL-1739); UX acceptance checklist 6.3 (HAL-1952)

The Studio shall show a plugin's settings from its `ui.settings` as label-over-field rows with the kit part for each type, shall save a setting when the person leaves its field or makes a pick, and shall show a `secret` setting as "Set" or "Not set" with the line "Stored in your secrets as *name*. Sent only to *hosts*." and never its value. When a value can't be saved, then the Studio shall say why under that field, put a pick or a switch back and keep typed text. While the plugin is off, the Studio shall keep the settings readable and save nothing.

## Examples

- Given the weather plugin's settings `city`, `units` and the secret `key`,
  when the page opens with nothing stored for `key`,
  then it shows City, Units and API key, "Not set", and "Stored in your secrets as weather-key. Sent only to api.example.com."
- Given City is Oslo,
  when the person types Bergen and leaves the field,
  then the host saves `{ city: "Bergen", units: "metric" }` and the toolbar says "Saving…" then "✓ Saved".
- Given the person types `abc` as the API key and leaves the field,
  then the keychain holds `abc` under `plugin__weather__weather-key`, the field empties and the row says "Set".
- Given the keychain is locked,
  when the person saves an API key,
  then the field says "Couldn't save the secret: The keychain is locked." and the typed key stays in the field.
- Given the plugin isn't trusted yet,
  when the person leaves the City field,
  then nothing is saved.
