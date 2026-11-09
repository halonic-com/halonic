# app.connection-settings

- Status: active
- Since: 0.1.0
- Source: HAL-9 decision 5 and plan v1.7 (sending mail only for a connection where "allow sending" is on, off by default, kept in the user's profile), HAL-186 step 7(b) (HAL-1531)

The app shall read each connector's "allow sending" setting from the `ConnectionSettingsStore` and shall treat sending as off when the connector has no settings or its settings can't be read. When sending is off, it shall give a reason that names the connector and doesn't repeat the store's error, and when the settings can't be read, it shall also give the error to the host. When a person switches sending on or off, it shall save the choice with the time from the clock, replacing any settings for that connector.

## Examples

- Given no settings for the connector `mail`,
  when sending is checked,
  then it isn't allowed, with the reason `sending is off for the connector "mail"`.
- Given settings for `mail` with sending on,
  when sending is checked for `mail` in the same workspace,
  then it is allowed; for `mail` in another workspace, or for another connector, it isn't.
- Given a store whose `get` throws for `mail`,
  when sending is checked,
  then it isn't allowed, the reason says the settings can't be read without the error's text, and the error is given back separately.
- Given a person switches sending on for `mail` at 10:00,
  when the settings are saved,
  then the store holds `allowSending: true` and `changedAt` 10:00, and switching it off later replaces them.
