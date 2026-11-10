# format.plugin-setting-values

- Status: active
- Since: 0.1.0
- Source: HAL-1735 plan, section 1 (`saveSettings`), approved by Liam on HAL-4038; the plugins ADR (`docs/adr/2026-11-09-plugins.md`), section 1.4

The format shall say whether a value can be saved for a plugin's setting by the rules its `default` follows: text for `text`, an `http` or `https` URL as `URL` writes it for `url`, a finite number for `number`, `true` or `false` for `boolean`, and one of the field's `choices` for `choice`. It shall refuse every value for a `secret` setting, whose value goes to `Secrets`. Each refusal shall be a message that says what to use.

## Examples

- Given a `number` setting, when `3` is checked, then there is no problem; when `"3"` or `NaN` is checked, then the problem says to use a number.
- Given a `url` setting, when `https://example.com/feed` is checked, then there is no problem; when `ftp://example.com` is checked, then the problem says to use an http or https address.
- Given a `choice` setting with the choices `metric` and `imperial`, when `kelvin` is checked, then the problem names both choices.
- Given a `secret` setting, when any value is checked, then the problem says it is kept in Secrets.
